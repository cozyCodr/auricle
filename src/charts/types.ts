/**
 * types.ts — shared prop shapes for Auricle's hand-rolled SVG charts.
 *
 * Kept framework-light so the chart components and the dashboard layer (and,
 * in 3.2, the per-chart query tools that drive `highlight`) share one vocabulary.
 */

/** A single point on a line/scatter: `x`/`y` numeric for positioning, `label` for display. */
export interface LinePoint {
  readonly x: number
  readonly y: number
  /** Original human label (e.g. "Mar 2024", "2019") used in ticks/tooltips/tables. */
  readonly label: string
}

/** A scatter point; same shape as a line point (label is usually the year). */
export type ScatterPoint = LinePoint

/** One categorical bar. `emphasis` outlines the bar (e.g. the home country) without breaking the single-hue rule. */
export interface BarDatum {
  readonly label: string
  readonly value: number
  readonly emphasis?: boolean
}

/**
 * Optional highlight overlay for a LineChart. 3.2 drives this from mirror events;
 * in 3.1 the components merely accept and render it.
 *  - `range`  — gold band between two numeric x values (with an optional edge label).
 *  - `point`  — glow dot at a numeric x plus a dark tooltip box (label + detail).
 */
export type LineHighlight =
  | { readonly kind: 'range'; readonly start: number; readonly end: number; readonly label?: string }
  | { readonly kind: 'point'; readonly x: number; readonly label?: string; readonly detail?: string }

/** Card size — the hero slot renders large; the small row renders compact. */
export type ChartVariant = 'hero' | 'small'

/** One column of a chart's data-table. */
export interface TableColumn {
  readonly key: string
  readonly label: string
  /** Right-align + mono figures when true. */
  readonly numeric?: boolean
}

/** A full accessible table model for the "View as table" toggle. */
export interface TableModel {
  /** Caption text; MUST cite the data source. */
  readonly caption: string
  readonly columns: readonly TableColumn[]
  readonly rows: ReadonlyArray<Record<string, string | number>>
}
