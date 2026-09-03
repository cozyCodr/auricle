/**
 * charts.ts — the single source of truth for chart identity in Auricle.
 *
 * This module owns (a) the typed shapes of the four climate data envelopes in
 * `src/data/*.json`, (b) the imported datasets, and (c) `CHARTS`: a typed array
 * of chart metadata whose `headline()` computes a one-line, real-figure summary
 * straight from the imported arrays (never a hardcoded paraphrase — refetch the
 * data and the numbers stay correct).
 *
 * Consumed by the global orientation/workspace tools, the chart renderers, and
 * the per-chart tool families (`surfaces.ts`), which reuse both the datasets
 * and the JSON-shape types exported here.
 */

import tempData from '../data/temp-anomaly.json'
import emittersData from '../data/co2-emitters.json'
import wealthData from '../data/wealth-carbon.json'
import co2LiveData from '../data/co2-live.json'

// --- JSON envelope shapes ---------------------------------------------------

/** Common provenance fields present on every data envelope. */
export interface DataEnvelope {
  readonly source: string
  readonly source_url: string
  readonly fetched_at: string
  readonly unit: string
  readonly note: string
}

/** One yearly point: `x` = calendar year, `y` = value. */
export interface YearPoint {
  readonly x: number
  readonly y: number
}

/** NASA GISTEMP annual global mean anomaly, °C vs 1951–1980. */
export interface TempAnomalyData extends DataEnvelope {
  readonly points: readonly YearPoint[]
}

/** One big emitting economy's latest-year total (million tonnes CO₂). */
export interface Emitter {
  readonly country: string
  readonly code: string
  readonly year: number
  readonly value: number
}
/** OWID/Global Carbon Budget: global yearly series + latest-year top emitters. */
export interface EmittersData extends DataEnvelope {
  readonly global_series: readonly YearPoint[]
  readonly emitters_latest: readonly Emitter[]
}

/** One country in the wealth↔carbon scatter: x = GDP/capita, y = t CO₂/capita. */
export interface WealthPoint {
  readonly country: string
  readonly code: string
  readonly x: number
  readonly y: number
}
export interface WealthCarbonData extends DataEnvelope {
  readonly year: number
  readonly x_label: string
  readonly y_label: string
  readonly points: readonly WealthPoint[]
}

/** One NOAA weekly mean: `x` = "YYYY-MM-DD" (week start), `y` = ppm. */
export interface PpmPoint {
  readonly x: string
  readonly y: number
}
export interface Co2LiveData extends DataEnvelope {
  readonly live_simulated: boolean
  readonly points: readonly PpmPoint[]
}

// --- Typed datasets (import the JSON once; reuse everywhere) ----------------

export const tempAnomaly = tempData as TempAnomalyData
export const emitters = emittersData as EmittersData
export const wealthCarbon = wealthData as WealthCarbonData
export const co2Live = co2LiveData as Co2LiveData

/** All four datasets keyed by chart id. */
export const DATASETS = {
  'temp-anomaly': tempAnomaly,
  'co2-emitters': emitters,
  'wealth-carbon': wealthCarbon,
  'co2-live': co2Live,
} as const

// --- Small numeric / formatting helpers ------------------------------------

/** Round to n decimals and drop trailing zeros (1.20 → "1.2", 0.5 → "0.5"). */
export function round(value: number, decimals = 2): string {
  return Number(value.toFixed(decimals)).toString()
}

/** Thousands-grouped integer, e.g. 38599 → "38,599". */
export function fmtInt(value: number): string {
  return Math.round(value).toLocaleString('en-US')
}

/** Signed anomaly with unit sign, e.g. 1.28 → "+1.28", -0.17 → "−0.17". */
export function fmtAnomaly(value: number): string {
  return value >= 0 ? `+${round(value, 2)}` : `−${round(Math.abs(value), 2)}`
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

function tempHeadline(): string {
  const pts = tempAnomaly.points
  const first = pts[0]
  const last = pts[pts.length - 1]
  const peak = maxBy(pts, (p) => p.y)
  return (
    `${pts.length} years of warming, ${first.x}–${last.x}: from ${fmtAnomaly(first.y)} °C ` +
    `to a record ${fmtAnomaly(peak.y)} °C in ${peak.x}, ${fmtAnomaly(last.y)} in ${last.x}.`
  )
}

function emittersHeadline(): string {
  const s = emitters.global_series
  const last = s[s.length - 1]
  const top = emitters.emitters_latest[0]
  return (
    `Global fossil CO₂ hit ${fmtInt(last.y)} Mt in ${last.x} — a record; ` +
    `${top.country} leads at ${fmtInt(top.value)} Mt.`
  )
}

function wealthHeadline(): string {
  const pts = wealthCarbon.points
  const r = pearson(pts.map((p) => p.x), pts.map((p) => p.y))
  const topCo2 = maxBy(pts, (p) => p.y)
  const lowCo2 = minBy(pts, (p) => p.y)
  return (
    `${pts.length} countries in ${wealthCarbon.year}: per-capita CO₂ runs ` +
    `${round(lowCo2.y, 2)} t (${lowCo2.country}) to ${round(topCo2.y, 1)} t (${topCo2.country}); ` +
    `wealth↔carbon correlation r≈${round(r, 2)}.`
  )
}

function co2LiveHeadline(): string {
  const pts = co2Live.points
  const last = pts[pts.length - 1]
  const lo = minBy(pts, (p) => p.y)
  const hi = maxBy(pts, (p) => p.y)
  const live = co2Live.live_simulated ? ' (simulated live)' : ''
  return (
    `${pts.length} weekly means at Mauna Loa ranging ${round(lo.y, 2)}–${round(hi.y, 2)} ppm; ` +
    `latest ${round(last.y, 2)} ppm${live} vs ~280 pre-industrial.`
  )
}

// --- Chart metadata --------------------------------------------------------

/** Rendering family for a chart, consumed by the chart components. */
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
 * The four charts, in display order. `temp-anomaly` is the canonical hero.
 * Ids MUST match the data file stems and are reused as surface ids.
 */
export const CHARTS: readonly ChartMeta[] = [
  {
    id: 'temp-anomaly',
    title: 'Global temperature anomaly',
    unit: '°C vs 1951–1980',
    period: `${tempAnomaly.points[0].x}–${tempAnomaly.points[tempAnomaly.points.length - 1].x}, yearly`,
    kind: 'line',
    source: tempAnomaly.source,
    headline: tempHeadline,
  },
  {
    id: 'co2-emitters',
    title: 'CO₂ emissions by country',
    unit: 'million tonnes CO₂ per year',
    period: `${emitters.global_series[0].x}–${emitters.global_series[emitters.global_series.length - 1].x}, yearly`,
    kind: 'bar',
    source: emitters.source,
    headline: emittersHeadline,
  },
  {
    id: 'wealth-carbon',
    title: 'Wealth vs carbon',
    unit: `${wealthCarbon.y_label} vs ${wealthCarbon.x_label}`,
    period: `${wealthCarbon.points.length} countries, ${wealthCarbon.year}`,
    kind: 'scatter',
    source: wealthCarbon.source,
    headline: wealthHeadline,
  },
  {
    id: 'co2-live',
    title: 'CO₂ at Mauna Loa',
    unit: 'ppm',
    period: 'recent weekly (simulated live)',
    kind: 'live',
    source: co2Live.source,
    headline: co2LiveHeadline,
  },
]

/** The four valid chart ids, in display order (handy for enums/validation). */
export const CHART_IDS = CHARTS.map((c) => c.id)

/** Look up a chart by id, or `undefined` if the id is unknown. */
export function getChart(id: string): ChartMeta | undefined {
  return CHARTS.find((c) => c.id === id)
}
