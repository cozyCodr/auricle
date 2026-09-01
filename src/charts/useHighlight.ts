/**
 * useHighlight.ts — the mirror→highlight bridge (React).
 *
 * The per-chart query tools (src/dashboard/surfaces.ts) emit a
 * `MirrorHighlightEvent` on the agent-a11y mirror bus whenever they answer. This
 * hook subscribes once (via `useMirror`), keeps the most recent painted event
 * FOR THE CURRENTLY FOCUSED chart, and hands it to the hero card so the gold
 * band / point glow / bar ring / scatter ring appears in sync with the spoken
 * answer.
 *
 * Auto-clear: a new highlight replaces the old one immediately; otherwise the
 * highlight fades on a ~8s timeout — UNLESS the viewer prefers reduced motion, in
 * which case the highlight simply persists until the next event (no timed clear
 * jank). Changing the focused chart clears any stale highlight at once.
 */

import { useEffect, useRef, useState } from 'react'
import { useMirror } from '../lib/agent-a11y'
import { asHighlightEvent, type MirrorHighlightEvent } from './highlight.ts'

const CLEAR_MS = 8000

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/**
 * The current highlight event for `focusedChartId`, or `undefined`. Only events
 * whose `chartId` matches the focused chart are surfaced (the focused chart is
 * the hero, and only its family is registered, so this maps to the hero visual).
 */
export function useChartHighlight(focusedChartId: string): MirrorHighlightEvent | undefined {
  const [event, setEvent] = useState<MirrorHighlightEvent>()
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const clearTimer = () => {
    if (timer.current !== undefined) {
      clearTimeout(timer.current)
      timer.current = undefined
    }
  }

  useMirror((raw) => {
    const hit = asHighlightEvent(raw)
    if (!hit || hit.chartId !== focusedChartId) return
    clearTimer()
    setEvent(hit)
    if (!prefersReducedMotion()) {
      timer.current = setTimeout(() => setEvent(undefined), CLEAR_MS)
    }
  })

  // Focus changed → drop any highlight belonging to the previous chart.
  useEffect(() => {
    clearTimer()
    setEvent(undefined)
    return clearTimer
  }, [focusedChartId])

  return event
}
