/**
 * react.ts — React glue for the agent-accessibility registry.
 *
 * Hooks bind the default {@link registry} to component lifecycles: a surface
 * registers on mount and unregisters on unmount, the tool log drives the
 * conversation rail, and mirror events reach the page.
 */

import { useEffect, useRef, useSyncExternalStore } from 'react'
import { registry } from './registry.ts'
import type { SurfaceDef } from './registry.ts'
import type { LogEntry } from './log.ts'
import type { MirrorEvent } from './mirror.ts'

/** Register `def` as a focusable surface while the component is mounted. */
export function useSurface(surfaceId: string, def: SurfaceDef): void {
  // Keep the latest def without forcing a re-register on every render.
  const defRef = useRef(def)
  defRef.current = def
  useEffect(() => {
    registry.registerSurface(surfaceId, defRef.current)
    return () => registry.unregisterSurface(surfaceId)
  }, [surfaceId])
}

/** Live view of the executed-tool log; re-renders on each new entry. */
export function useToolLog(): readonly LogEntry[] {
  return useSyncExternalStore(
    (cb) => registry.log.subscribe(cb),
    () => registry.log.getSnapshot(),
    () => registry.log.getSnapshot(),
  )
}

/** Subscribe to page-mirroring events for the component's lifetime. */
export function useMirror(handler: (event: MirrorEvent) => void): void {
  const handlerRef = useRef(handler)
  handlerRef.current = handler
  useEffect(() => registry.mirror.subscribe((event) => handlerRef.current(event)), [])
}

/** `true` when `document.modelContext` (WebMCP) is present. */
export function useAgentAvailable(): boolean {
  return useSyncExternalStore(
    () => () => {}, // availability is fixed for the page's lifetime
    () => registry.isAvailable(),
    () => false,
  )
}
