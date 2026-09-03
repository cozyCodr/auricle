/**
 * highlight.ts — the typed "visual mirror" vocabulary shared by the query tools
 * (which EMIT these events) and the chart layer (which RENDERS them).
 *
 * The agent-a11y {@link MirrorEvent} bus is intentionally open (`{kind}` + extra
 * fields). This module narrows the subset the charts actually paint into a
 * discriminated union, plus tiny constructors so `surfaces.ts` never hand-writes
 * an event shape, plus pure mappers the render layer uses to turn an event into a
 * concrete overlay. No React here — `useChartHighlight` (react-bound) lives in
 * `./useHighlight.ts` and imports these.
 *
 * The four painted kinds:
 *  - `highlight-point` → LineChart point glow + dark tooltip (also drives the
 *    LiveFeed answer pill, whose x is the last sparkline index).
 *  - `highlight-range` → LineChart gold band between two numeric x values.
 *  - `bar-emphasis`    → BarChart: gold ring + tooltip on the named bar.
 *  - `scatter-ring`    → ScatterChart: gold ring + tooltip on the year's dot.
 *
 * All numeric x/start/end are already in the TARGET chart's numeric x-domain
 * (the lines: the calendar year; the live feed: sparkline index), so the render layer maps them
 * straight through.
 */

import type { MirrorEvent } from '../lib/agent-a11y'
import type { LineHighlight } from './types.ts'

/**
 * Every painted event carries the open `MirrorEvent` index signature so the
 * constructors' results drop straight onto `NarratedResult.mirror`.
 */
interface MirrorShape {
  readonly kind: string
  readonly [extra: string]: unknown
}

/** Gold point glow + dark tooltip at a numeric x in the chart's x-domain. */
export interface HighlightPointEvent extends MirrorShape {
  readonly kind: 'highlight-point'
  readonly chartId: string
  readonly x: number
  readonly label?: string
  readonly detail?: string
}

/** Gold band between two numeric x values (with an optional edge label). */
export interface HighlightRangeEvent extends MirrorShape {
  readonly kind: 'highlight-range'
  readonly chartId: string
  readonly start: number
  readonly end: number
  readonly label?: string
}

/** Emphasise one bar by its display label (e.g. "China"). */
export interface BarEmphasisEvent extends MirrorShape {
  readonly kind: 'bar-emphasis'
  readonly chartId: string
  readonly country: string
  readonly label?: string
  readonly detail?: string
}

/** Ring the scatter dot whose point label matches (e.g. a country name). */
export interface ScatterRingEvent extends MirrorShape {
  readonly kind: 'scatter-ring'
  readonly chartId: string
  readonly match: string
  readonly label?: string
  readonly detail?: string
}

/** The union of mirror events the chart layer knows how to paint. */
export type MirrorHighlightEvent =
  | HighlightPointEvent
  | HighlightRangeEvent
  | BarEmphasisEvent
  | ScatterRingEvent

const PAINTED_KINDS = new Set<string>([
  'highlight-point',
  'highlight-range',
  'bar-emphasis',
  'scatter-ring',
])

/** Narrow an open {@link MirrorEvent} to a painted highlight, or `null`. */
export function asHighlightEvent(event: MirrorEvent): MirrorHighlightEvent | null {
  return PAINTED_KINDS.has(event.kind) ? (event as unknown as MirrorHighlightEvent) : null
}

// --- Constructors (so tools never hand-write an event object) --------------

export function hlPoint(
  chartId: string,
  x: number,
  label?: string,
  detail?: string,
): HighlightPointEvent {
  return { kind: 'highlight-point', chartId, x, label, detail }
}

export function hlRange(
  chartId: string,
  start: number,
  end: number,
  label?: string,
): HighlightRangeEvent {
  return { kind: 'highlight-range', chartId, start, end, label }
}

export function barEmphasis(
  chartId: string,
  country: string,
  label?: string,
  detail?: string,
): BarEmphasisEvent {
  return { kind: 'bar-emphasis', chartId, country, label, detail }
}

export function scatterRing(
  chartId: string,
  match: string,
  label?: string,
  detail?: string,
): ScatterRingEvent {
  return { kind: 'scatter-ring', chartId, match, label, detail }
}

// --- Pure mappers used by the render layer ---------------------------------

/** A painted event → a LineChart `highlight` prop, or `null` if not line-shaped. */
export function lineHighlightFromMirror(event: MirrorHighlightEvent): LineHighlight | null {
  if (event.kind === 'highlight-point') {
    return { kind: 'point', x: event.x, label: event.label, detail: event.detail }
  }
  if (event.kind === 'highlight-range') {
    return { kind: 'range', start: event.start, end: event.end, label: event.label }
  }
  return null
}
