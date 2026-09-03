/**
 * workspace.ts — the commissioned-views store behind Auricle's workspace arc.
 *
 * Auricle boots as a raw data shelf: four dense real-data tables and NO charts.
 * A chart exists only because someone asked for it — the agent via the global
 * `create_view` tool, or a human clicking a dataset's shelf header. Both paths
 * run {@link commissionView}, which:
 *   1. appends the view to the ordered workspace list (idempotent per chartId),
 *   2. registers that chart's surface + tool family at runtime
 *      (`registry.registerSurface`) — surfaces are BORN on commission, never
 *      pre-registered at boot,
 *   3. moves focus to the new view via the shared focus controller, so the
 *      family registers and the UI reflows.
 *
 * {@link clearWorkspace} reverses all of it: unregisters every commissioned
 * surface, blurs, and returns the app to the shelf.
 *
 * Same `useSyncExternalStore` pattern as `focus.ts`; framework-agnostic core so
 * the arc is unit-tested browserless in `workspace.check.mts`.
 */

import { useSyncExternalStore } from 'react'
import { registry } from '../lib/agent-a11y'
import { getChart, type ChartKind } from './charts.ts'
import { buildSurface } from './surfaces.ts'
import { setFocus } from './focus.ts'

/** One commissioned view: which dataset, drawn as which kind. */
export interface WorkspaceView {
  readonly chartId: string
  readonly kind: ChartKind
}

let views: readonly WorkspaceView[] = []
const listeners = new Set<() => void>()

function emit(): void {
  for (const l of listeners) l()
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

function getSnapshot(): readonly WorkspaceView[] {
  return views
}

/** The ordered commissioned views (non-reactive read, for tool handlers). */
export function getWorkspace(): readonly WorkspaceView[] {
  return views
}

/** Commissioned chart ids, in commission order. */
export function getWorkspaceIds(): string[] {
  return views.map((v) => v.chartId)
}

/** Whether a chart id has been commissioned. */
export function isCommissioned(chartId: string): boolean {
  return views.some((v) => v.chartId === chartId)
}

/**
 * Commission a view: add it to the workspace (idempotent per chartId), register
 * its surface + tool family with the registry, and focus it. Returns the view
 * and whether it was newly created. Single code path for the `create_view` tool
 * AND shelf table-header clicks (agent/human parity).
 */
export function commissionView(
  chartId: string,
  kind?: ChartKind,
): { view: WorkspaceView; created: boolean } | null {
  const chart = getChart(chartId)
  if (!chart) return null
  const resolvedKind: ChartKind = kind ?? chart.kind

  const existing = views.find((v) => v.chartId === chartId)
  if (existing) {
    // Idempotent: no duplicate view; still (re)apply focus so the family is live.
    setFocus(chartId)
    emit()
    return { view: existing, created: false }
  }

  const surface = buildSurface(chartId)
  if (!surface) return null
  const view: WorkspaceView = { chartId, kind: resolvedKind }
  views = [...views, view]
  registry.registerSurface(chartId, surface) // the surface is born HERE
  setFocus(chartId) // registers the family + reflows the UI
  emit()
  return { view, created: true }
}

/**
 * Clear the workspace: blur focus, unregister every commissioned surface (their
 * tool families disappear from getTools()), and return to the raw shelf.
 */
export function clearWorkspace(): void {
  setFocus(null) // blur → the focused family unregisters
  for (const v of views) registry.unregisterSurface(v.chartId)
  views = []
  emit()
}

/**
 * Re-register the co2-live family so `current_value`'s live description (and the
 * tools' session-local answers) reflect the latest tick. Only does anything once
 * the live view has been commissioned — surfaces are never resurrected at boot.
 * `registry.registerSurface` re-applies the family only while co2-live is
 * focused (cleanly swapping the abort controller, constant tool count, no
 * listener leak); otherwise it just refreshes the stored def for the next focus.
 * Called on each live-feed tick (see App.tsx).
 */
export function refreshLiveSurface(): void {
  if (!isCommissioned('co2-live')) return
  const surface = buildSurface('co2-live')
  if (surface) registry.registerSurface('co2-live', surface)
}

/** Reactive hook: the ordered commissioned views, re-rendering on each change. */
export function useWorkspace(): readonly WorkspaceView[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/** TEST-ONLY: reset the store between browserless check scenarios. */
export function __resetWorkspaceForTests(): void {
  clearWorkspace()
}
