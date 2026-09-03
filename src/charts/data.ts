/**
 * data.ts — chart-layer adapters over the baked climate datasets from
 * `../dashboard/charts`.
 *
 * The dashboard layer owns the typed JSON (`tempAnomaly`, `emitters`, …); this
 * module reshapes each dataset into the numeric `{x,y,label}` form the SVG
 * components draw, plus an accessible `TableModel` per dataset for both the
 * raw-data shelf (the app's initial state) and the "View as table" toggle.
 *
 * The tool families import the numeric series so `highlight` overlays are
 * expressed in the same x-domain the charts draw in (calendar years for the
 * lines; GDP per capita for the scatter; sparkline index for the live feed).
 */

import {
  tempAnomaly,
  emitters,
  wealthCarbon,
  co2Live,
  fmtAnomaly,
  fmtInt,
  round,
  maxBy,
  pearson,
} from '../dashboard/charts.ts'
import type { LinePoint, ScatterPoint, BarDatum, TableModel } from './types.ts'

// --- Line: global temperature anomaly (yearly, the hero) --------------------

export const tempLine: LinePoint[] = tempAnomaly.points.map((p) => ({
  x: p.x,
  y: p.y,
  label: String(p.x),
}))

/** The record-warm year, computed from the real data. */
export const tempPeak: LinePoint = tempLine.reduce((best, cur) => (cur.y > best.y ? cur : best))

// --- Line + bars: global CO₂ series and latest-year top emitters ------------

export const emittersGlobalLine: LinePoint[] = emitters.global_series.map((p) => ({
  x: p.x,
  y: p.y,
  label: String(p.x),
}))

export const emitterBars: BarDatum[] = emitters.emitters_latest.map((e, i) => ({
  label: e.country,
  value: e.value,
  emphasis: i === 0, // the top emitter carries the outline emphasis
}))

/** Top emitters ranked descending — the hbar view's rows. */
export const emitterRanked: BarDatum[] = [...emitterBars].sort((a, b) => b.value - a.value)

// --- Share of the REAL global total (the craft-approved pie alternative) -----

/** One segment of the 100% proportion bar. */
export interface ShareSegment {
  readonly label: string
  /** Absolute Mt CO₂. */
  readonly value: number
  /** Fraction of the global latest-year total, 0–1. */
  readonly share: number
}

const globalLatest = emitters.global_series[emitters.global_series.length - 1]

/**
 * Each top emitter's share of the REAL global total (value / global latest
 * year), with the remainder as "Rest of world". Shares are computed, never
 * hardcoded — refetch the data and the percentages stay correct.
 */
export const emitterShares: ShareSegment[] = (() => {
  const named = [...emitters.emitters_latest]
    .sort((a, b) => b.value - a.value)
    .map((e) => ({ label: e.country, value: e.value, share: e.value / globalLatest.y }))
  const restValue = globalLatest.y - named.reduce((sum, s) => sum + s.value, 0)
  return [...named, { label: 'Rest of world', value: restValue, share: restValue / globalLatest.y }]
})()

/** The latest global-total year the shares are computed against. */
export const shareYear: number = globalLatest.x
export const shareGlobalTotal: number = globalLatest.y

// --- Stat tiles: one big real figure + one context line per dataset ----------

export interface StatSpec {
  /** The huge mono figure, e.g. "+1.28 °C". */
  readonly figure: string
  /** One context line, e.g. "2024, hottest of 146 years". */
  readonly context: string
}

/** The big-number tile content for any dataset — computed from the real data. */
export function statFor(chartId: string): StatSpec | undefined {
  switch (chartId) {
    case 'temp-anomaly': {
      const peak = maxBy(tempAnomaly.points, (p) => p.y)
      return {
        figure: `${fmtAnomaly(peak.y)} °C`,
        context: `${peak.x}, hottest of ${tempAnomaly.points.length} years`,
      }
    }
    case 'co2-emitters': {
      const last = emitters.global_series[emitters.global_series.length - 1]
      const isRecord = last.y >= maxBy(emitters.global_series, (p) => p.y).y
      return {
        figure: `${fmtInt(last.y)} Mt`,
        context: `global CO₂ in ${last.x}${isRecord ? ', an all-time record' : ''}`,
      }
    }
    case 'wealth-carbon': {
      const r = pearson(
        wealthCarbon.points.map((p) => p.x),
        wealthCarbon.points.map((p) => p.y),
      )
      return {
        figure: `r ≈ ${round(r, 2)}`,
        context: 'wealth still predicts carbon',
      }
    }
    case 'co2-live': {
      const last = co2Live.points[co2Live.points.length - 1]
      return {
        figure: `${round(last.y, 2)} ppm`,
        context: 'this week at Mauna Loa',
      }
    }
    default:
      return undefined
  }
}

// --- Scatter: GDP per capita vs CO₂ per capita ------------------------------

/** Dots keyed by country name (the label the mirror ring matches against). */
export const wealthScatter: ScatterPoint[] = wealthCarbon.points.map((p) => ({
  x: p.x,
  y: p.y,
  label: p.country,
}))

// --- Live: NOAA Mauna Loa weekly CO₂ ----------------------------------------

/** Sparkline series (sequential index x); `label` is the ISO week-start date. */
export const ppmLine: LinePoint[] = co2Live.points.map((p, i) => ({
  x: i,
  y: p.y,
  label: p.x,
}))

/** Latest real weekly mean — the live feed's seed. */
export const ppmCurrent: number = co2Live.points[co2Live.points.length - 1].y

// --- Accessible table models (one per dataset; captions cite the source) ----

const TABLES: Record<string, TableModel> = {
  'temp-anomaly': {
    caption: `Global mean temperature anomaly, °C vs 1951–1980, yearly. Source: ${tempAnomaly.source}.`,
    columns: [
      { key: 'year', label: 'Year', numeric: true },
      { key: 'anomaly', label: '°C anomaly', numeric: true },
    ],
    rows: tempAnomaly.points.map((p) => ({
      year: p.x,
      anomaly: fmtAnomaly(p.y),
    })),
  },
  'co2-emitters': {
    caption: `Global fossil CO₂ emissions, million tonnes per year, plus latest-year top emitters. Source: ${emitters.source}.`,
    columns: [
      { key: 'year', label: 'Year', numeric: true },
      { key: 'mt', label: 'World Mt CO₂', numeric: true },
    ],
    rows: emitters.global_series.map((p) => ({
      year: p.x,
      mt: fmtInt(p.y),
    })),
  },
  'wealth-carbon': {
    caption: `GDP per capita (international-$) vs CO₂ per capita (t/year), ${wealthCarbon.year}. Source: ${wealthCarbon.source}.`,
    columns: [
      { key: 'country', label: 'Country' },
      { key: 'gdp', label: 'GDP/capita $', numeric: true },
      { key: 'co2', label: 't CO₂/capita', numeric: true },
    ],
    rows: [...wealthCarbon.points]
      .sort((a, b) => b.x - a.x)
      .map((p) => ({ country: p.country, gdp: fmtInt(p.x), co2: p.y.toFixed(2) })),
  },
  'co2-live': {
    caption: `CO₂ at Mauna Loa, weekly mean ppm (simulated live feed). Source: ${co2Live.source}.`,
    columns: [
      { key: 'week', label: 'Week of' },
      { key: 'ppm', label: 'ppm', numeric: true },
    ],
    rows: [...co2Live.points].reverse().map((p) => ({ week: p.x, ppm: p.y.toFixed(2) })),
  },
}

/** The accessible table model for a chart id (shelf + "View as table"). */
export function tableFor(chartId: string): TableModel | undefined {
  return TABLES[chartId]
}

/** Real row count of a dataset's table (for the shelf's honest headlines). */
export function rowCountFor(chartId: string): number {
  return TABLES[chartId]?.rows.length ?? 0
}

/** Total rows across every dataset — the shelf's "N rows. Zero answers." */
export const TOTAL_ROWS: number = Object.values(TABLES).reduce((n, t) => n + t.rows.length, 0)
