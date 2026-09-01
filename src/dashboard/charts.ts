/**
 * charts.ts — the single source of truth for chart identity in Auricle.
 *
 * This module owns (a) the typed shapes of the four data envelopes in
 * `src/data/*.json`, (b) the imported datasets, and (c) `CHARTS`: a typed array
 * of chart metadata whose `headline()` computes a one-line, real-figure summary
 * straight from the imported arrays (never a hardcoded paraphrase — refetch the
 * data and the numbers stay correct).
 *
 * Consumed now by the global orientation tools (2.2) and later by chart
 * rendering (3.1) and the expanded per-chart tool families (3.2), which reuse
 * both the datasets and the JSON-shape types exported here.
 */

import maizeData from '../data/maize-prices.json'
import mortalityData from '../data/under5-mortality.json'
import yieldData from '../data/yield-fertilizer.json'
import exchangeData from '../data/exchange-rate.json'

// --- JSON envelope shapes (shared with 3.1 / 3.2) --------------------------

/** Common provenance fields present on every data envelope. */
export interface DataEnvelope {
  readonly source: string
  readonly source_url: string
  readonly fetched_at: string
  readonly unit: string
  readonly note: string
}

/** One monthly maize observation: `x` = "YYYY-MM", `y` = ZMW/kg, `n` = markets. */
export interface MaizePoint {
  readonly x: string
  readonly y: number
  readonly n: number
}
export interface MaizeData extends DataEnvelope {
  readonly commodity: string
  readonly normalization: string
  readonly points: readonly MaizePoint[]
}

/** One yearly point: `x` = calendar year, `y` = value. */
export interface YearPoint {
  readonly x: number
  readonly y: number
}
/** One comparator country's latest under-5 mortality value. */
export interface Comparator {
  readonly country: string
  readonly code: string
  readonly year: number
  readonly value: number
}
export interface MortalityData extends DataEnvelope {
  readonly zambia_series: readonly YearPoint[]
  readonly comparators_latest: readonly Comparator[]
}

/** One year of the fertilizer→yield scatter: `x` = fertilizer, `y` = yield. */
export interface YieldPoint {
  readonly year: number
  readonly x: number
  readonly y: number
}
export interface YieldData extends DataEnvelope {
  readonly source_url_x: string
  readonly x_label: string
  readonly y_label: string
  readonly points: readonly YieldPoint[]
}

/** One daily FX close: `x` = "YYYY-MM-DD", `y` = ZMW per USD. */
export interface FxPoint {
  readonly x: string
  readonly y: number
}
export interface FxData extends DataEnvelope {
  readonly live_simulated: boolean
  readonly points: readonly FxPoint[]
}

// --- Typed datasets (import the JSON once; reuse everywhere) ----------------

export const maize = maizeData as MaizeData
export const mortality = mortalityData as MortalityData
export const yieldFert = yieldData as YieldData
export const exchange = exchangeData as FxData

/** All four datasets keyed by chart id, for 3.1/3.2 to reuse. */
export const DATASETS = {
  'maize-prices': maize,
  'under5-mortality': mortality,
  'yield-fertilizer': yieldFert,
  'exchange-rate': exchange,
} as const

// --- Small numeric / formatting helpers ------------------------------------

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const

/** "2025-01" → "Jan 2025"; "2025-01" or "2025-01-15" both supported. */
export function fmtMonth(ym: string): string {
  const [y, m] = ym.split('-')
  const idx = Number(m) - 1
  return `${MONTHS[idx] ?? m} ${y}`
}

/** Round to n decimals and drop trailing zeros (12.10 → "12.1", 5.6 → "5.6"). */
export function round(value: number, decimals = 2): string {
  return Number(value.toFixed(decimals)).toString()
}

export function minBy<T>(items: readonly T[], key: (t: T) => number): T {
  return items.reduce((best, cur) => (key(cur) < key(best) ? cur : best))
}
export function maxBy<T>(items: readonly T[], key: (t: T) => number): T {
  return items.reduce((best, cur) => (key(cur) > key(best) ? cur : best))
}

/** Pearson correlation of paired (x, y) samples. */
export function pearson(xs: readonly number[], ys: readonly number[]): number {
  const n = xs.length
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let cov = 0
  let sx = 0
  let sy = 0
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx
    const dy = ys[i] - my
    cov += dx * dy
    sx += dx * dx
    sy += dy * dy
  }
  return cov / Math.sqrt(sx * sy)
}

// --- Per-chart headline computations (derived from the real arrays) --------

function maizeHeadline(): string {
  const pts = maize.points
  const first = pts[0]
  const last = pts[pts.length - 1]
  const peak = maxBy(pts, (p) => p.y)
  const ratio = round(peak.y / first.y, 1)
  return (
    `Peaked at ${round(peak.y)} ZMW/kg in ${fmtMonth(peak.x)}, up ${ratio}× ` +
    `from ${round(first.y)} in ${fmtMonth(first.x)}; eased to ${round(last.y)} ` +
    `by ${fmtMonth(last.x)}.`
  )
}

function mortalityHeadline(): string {
  const s = mortality.zambia_series
  const first = s[0]
  const last = s[s.length - 1]
  const share = last.y / first.y
  const change = share <= 0.5 ? 'more than halved' : 'fell'
  return (
    `Zambia's under-5 mortality ${change}, from ${round(first.y, 1)} in ${first.x} ` +
    `to ${round(last.y, 1)} deaths per 1,000 in ${last.x}.`
  )
}

function yieldHeadline(): string {
  const pts = yieldFert.points
  const first = pts[0]
  const last = pts[pts.length - 1]
  const r = pearson(pts.map((p) => p.x), pts.map((p) => p.y))
  return (
    `Fertilizer use rose from ${round(first.x)} to ${round(last.x)} kg/ha ` +
    `(${first.year}–${last.year}) as cereal yield climbed ${round(first.y)}→${round(last.y)} kg/ha; ` +
    `a positive but rain-dependent link (r≈${round(r, 2)}).`
  )
}

function exchangeHeadline(): string {
  const pts = exchange.points
  const last = pts[pts.length - 1]
  const lo = minBy(pts, (p) => p.y)
  const hi = maxBy(pts, (p) => p.y)
  const live = exchange.live_simulated ? ' (simulated live)' : ''
  return (
    `${pts.length} daily closes ranging ${round(lo.y)}–${round(hi.y)} ZMW/USD; ` +
    `latest ${round(last.y)}${live}.`
  )
}

// --- Chart metadata --------------------------------------------------------

/** Rendering family for a chart, consumed by 3.1's chart components. */
export type ChartKind = 'line' | 'bar' | 'scatter' | 'live'

/** Stable identity + narratable headline for one chart. */
export interface ChartMeta {
  /** Chart id — equals the data file stem; used as the surface id everywhere. */
  readonly id: string
  readonly title: string
  readonly unit: string
  readonly period: string
  readonly kind: ChartKind
  /** Human-readable data source (from the JSON envelope). */
  readonly source: string
  /** One-line real-figure summary, computed from the imported arrays. */
  headline(): string
}

/**
 * The four charts, in display order. `maize-prices` is the hero.
 * Ids MUST match the data file stems and are reused as surface ids.
 */
export const CHARTS: readonly ChartMeta[] = [
  {
    id: 'maize-prices',
    title: 'Maize meal retail price',
    unit: 'ZMW per kg',
    period: '2015–2025, monthly',
    kind: 'line',
    source: maize.source,
    headline: maizeHeadline,
  },
  {
    id: 'under5-mortality',
    title: 'Under-5 mortality',
    unit: 'deaths per 1,000 live births',
    period: '2000–2024, yearly',
    kind: 'line',
    source: mortality.source,
    headline: mortalityHeadline,
  },
  {
    id: 'yield-fertilizer',
    title: 'Cereal yield vs fertilizer',
    unit: `${yieldFert.y_label} vs ${yieldFert.x_label}`,
    period: '1961–2023, yearly',
    kind: 'scatter',
    source: yieldFert.source,
    headline: yieldHeadline,
  },
  {
    id: 'exchange-rate',
    title: 'ZMW / USD',
    unit: 'ZMW per USD',
    period: 'recent daily (simulated live)',
    kind: 'live',
    source: exchange.source,
    headline: exchangeHeadline,
  },
]

/** The four valid chart ids, in display order (handy for enums/validation). */
export const CHART_IDS = CHARTS.map((c) => c.id)

/** Look up a chart by id, or `undefined` if the id is unknown. */
export function getChart(id: string): ChartMeta | undefined {
  return CHARTS.find((c) => c.id === id)
}
