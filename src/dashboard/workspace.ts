/**
 * workspace.ts — the commissioned-views store behind Auricle's workspace arc.
 *
 * Auricle boots as a raw data shelf: four dense real-data tables and NO charts.
 * A chart exists only because someone asked for it — the agent via the global
 * `create_view` tool, or a human clicking a dataset's shelf header. Both paths
 * run {@link commissionView}.
 *
 * GRAPH VARIETY (P0-01b): the workspace stores view INSTANCES keyed by the
 * (chartId, kind) pair, so the same dataset can be commissioned as multiple
 * kinds at once — temp-anomaly as a line AND as warming stripes, side by side.
 * Idempotence is per pair (re-asking for an existing pair just refocuses it and
 * bumps it to most-recent). The chart's surface + tool family is per DATASET:
 * it registers once, with the FIRST view of a chartId, and unregisters only
 * when the LAST view of that chartId is removed. Focus stays per-chartId too —
 * tool families are per-dataset, not per-drawing.
 *
 * {@link clearWorkspace} reverses all of it: unregisters every commissioned
 * surface, blurs, and returns the app to the shelf. {@link removeView} removes
 * one (chartId, kind) instance, tearing the family down only when it was the
 * dataset's last view.
 *
 * Same `useSyncExternalStore` pattern as `focus.ts`; framework-agnostic core so
 * the arc is unit-tested browserless in `workspace.check.mts`.
 */

import { useSyncExternalStore } from 'react'
import { registry } from '../lib/agent-a11y'
import { getChart, isValidKind, type ChartKind } from './charts.ts'
import { buildSurface } from './surfaces.ts'
import { setFocus, getFocus } from './focus.ts'

/** One commissioned view instance: which dataset, drawn as which kind. */
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

/** UNIQUE commissioned chart ids, in first-commission order. */
export function getWorkspaceIds(): string[] {
  return [...new Set(views.map((v) => v.chartId))]
}

/** Whether a chart id has at least one commissioned view. */
export function isCommissioned(chartId: string): boolean {
  return views.some((v) => v.chartId === chartId)
}

/** Whether the exact (chartId, kind) view instance exists. */
export function hasView(chartId: string, kind: ChartKind): boolean {
  return views.some((v) => v.chartId === chartId && v.kind === kind)
}

/** The kinds a chart id is currently rendered as, in commission order. */
export function kindsFor(chartId: string): ChartKind[] {
  return views.filter((v) => v.chartId === chartId).map((v) => v.kind)
}

/** Result of a commission: the view, plus what actually changed. */
export interface CommissionResult {
  view: WorkspaceView
  /** True when a NEW view instance was added (false: exact pair re-asked). */
  created: boolean
  /** True when this was the chartId's FIRST view — its family was just born. */
  familyBorn: boolean
}

/**
 * Commission a view: add the (chartId, kind) instance to the workspace
 * (idempotent per PAIR), register the dataset's surface + tool family on its
 * first view, and focus the dataset. Single code path for the `create_view`
 * tool AND shelf table-header clicks (agent/human parity). Returns null for an
 * unknown chartId or an off-whitelist (dataset, kind) pair — the orientation
 * tool pre-validates so it can narrate the valid kinds instead.
 */
export function commissionView(
  chartId: string,
  kind?: ChartKind,
): CommissionResult | null {
  const chart = getChart(chartId)
  if (!chart) return null
  const resolvedKind: ChartKind = kind ?? chart.kind
  if (!isValidKind(chartId, resolvedKind)) return null

  const existing = views.find((v) => v.chartId === chartId && v.kind === resolvedKind)
  if (existing) {
    // Idempotent per pair: no duplicate instance; bump it to most-recent so the
    // hero slot (focused dataset's most-recent view) shows it, and refocus.
    views = [...views.filter((v) => v !== existing), existing]
    setFocus(chartId)
    emit()
    return { view: existing, created: false, familyBorn: false }
  }

  const familyBorn = !isCommissioned(chartId)
  if (familyBorn) {
    const surface = buildSurface(chartId)
    if (!surface) return null
    registry.registerSurface(chartId, surface) // the surface is born HERE, once per dataset
  }
  const view: WorkspaceView = { chartId, kind: resolvedKind }
  views = [...views, view]
  setFocus(chartId) // registers/keeps the family + reflows the UI
  emit()
  return { view, created: true, familyBorn }
}

/**
 * Remove ONE (chartId, kind) view instance. The dataset's surface + tool family
 * survives while ANY view of that chartId remains; removing the LAST view
 * unregisters the family (and moves focus to the most recent remaining view,
 * or blurs back toward the shelf). Returns false if the pair wasn't present.
 */
export function removeView(chartId: string, kind: ChartKind): boolean {
  const target = views.find((v) => v.chartId === chartId && v.kind === kind)
  if (!target) return false
  views = views.filter((v) => v !== target)
  const stillRendered = views.some((v) => v.chartId === chartId)
  if (!stillRendered) {
    if (getFocus() === chartId) {
      const next = views[views.length - 1]
      setFocus(next ? next.chartId : null)
    }
    registry.unregisterSurface(chartId) // last view gone → family dies
  }
  emit()
  return true
}

/**
 * Clear the workspace: blur focus, unregister every commissioned surface (their
 * tool families disappear from getTools()), and return to the publication.
 */
export function clearWorkspace(): void {
  setFocus(null) // blur → the focused family unregisters
  for (const id of getWorkspaceIds()) registry.unregisterSurface(id)
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
