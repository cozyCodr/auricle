/**
 * focus.ts — the reactive focus controller that unifies the two focus paths.
 *
 * Focus in Auricle can change two ways: the user clicks a chart card, or the
 * agent calls the `focus_chart` tool. The agent-a11y `registry` owns the real
 * focus (it swaps tool families) but is not a React store, so the UI can't
 * subscribe to it directly.
 *
 * This module is a thin `useSyncExternalStore`-compatible store layered ON TOP
 * of the registry (agent-a11y is never modified). `setFocus(id)` is the single
 * writer: it calls `registry.focus(id)` (or `blur()`), records the id, and
 * notifies React subscribers. Both the `focus_chart` tool (rewired in
 * orientation.ts) and card clicks call `setFocus`, so every focus change updates
 * the hero card, badges, and dimming — whoever triggered it.
 */

import { useSyncExternalStore } from 'react'
import { registry } from '../lib/agent-a11y'

/** The chart focused on first load: the maize hero. */
export const DEFAULT_FOCUS = 'maize-prices'

let focusedId: string | null = DEFAULT_FOCUS
const listeners = new Set<() => void>()

function emit(): void {
  for (const l of listeners) l()
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

function getSnapshot(): string | null {
  return focusedId
}

/**
 * Move focus to `id` (or clear it with `null`). Single writer for both the
 * `focus_chart` tool and card clicks. Drives the registry (family swap) AND the
 * React store (UI reflow) from one call.
 */
export function setFocus(id: string | null): void {
  focusedId = id
  if (id) registry.focus(id)
  else registry.blur()
  emit()
}

/** Current focused chart id (non-reactive read, for tool `execute` handlers). */
export function getFocus(): string | null {
  return focusedId
}

/**
 * Sync the registry to the store's default once, at app start (after surfaces
 * are registered). Idempotent — the registry no-ops a re-focus of the same id.
 */
export function initFocus(): void {
  if (focusedId) registry.focus(focusedId)
}

/** Reactive hook: the focused chart id, re-rendering on every focus change. */
export function useFocusedChart(): string | null {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
