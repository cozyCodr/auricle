/**
 * data.ts — chart-layer adapters over the baked datasets from `../dashboard/charts`.
 *
 * The dashboard layer owns the typed JSON (`maize`, `mortality`, …); this module
 * reshapes each dataset into the numeric `{x,y,label}` form the SVG components
 * draw, plus an accessible `TableModel` per chart for the "View as table" toggle.
 *
 * 3.2 can import the numeric series and the `monthIndexOf` helper to express
 * `highlight` overlays in the same x-domain the LineChart draws in.
 */

import { maize, mortality, yieldFert, exchange } from '../dashboard/charts.ts'
import type { LinePoint, ScatterPoint, BarDatum, TableModel, LineHighlight } from './types.ts'

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const

/** "2015-01" → a monotonic month index (year*12 + monthIndex); the LineChart x-domain for maize. */
export function monthIndexOf(ym: string): number {
  const [y, m] = ym.split('-').map(Number)
  return y * 12 + (m - 1)
}

/** "2015-01" → "Jan 2015". */
function monthLabel(ym: string): string {
  const [y, m] = ym.split('-')
  return `${MONTHS[Number(m) - 1] ?? m} ${y}`
}

/** Short display names for the mortality comparator bars. */
const COUNTRY_SHORT: Record<string, string> = {
  ZMB: 'Zambia',
  NGA: 'Nigeria',
  COD: 'DR Congo',
  ZWE: 'Zimbabwe',
  KEN: 'Kenya',
  TZA: 'Tanzania',
  ZAF: 'S. Africa',
}

// --- Line: maize retail price (monthly, with a real 15-month gap) -----------

export const maizeLine: LinePoint[] = maize.points.map((p) => ({
  x: monthIndexOf(p.x),
  y: p.y,
  label: monthLabel(p.x),
}))

/** The all-time peak of the maize series, computed from the real data. */
export const maizePeak: LinePoint = maizeLine.reduce((best, cur) => (cur.y > best.y ? cur : best))

/**
 * A demo highlight proving the LineChart renders the gold band + dark tooltip.
 * Derived from real data (the decade peak) — 3.2 will replace this with a
 * mirror-driven overlay.
 */
export const maizeDemoHighlight: LineHighlight = {
  kind: 'point',
  x: maizePeak.x,
  label: `${maizePeak.label} · K${maizePeak.y.toFixed(2)}`,
  detail: 'decade peak — retail maize meal',
}

// --- Line: Zambia under-5 mortality (yearly) -------------------------------

export const mortalityLine: LinePoint[] = mortality.zambia_series.map((p) => ({
  x: p.x,
  y: p.y,
  label: String(p.x),
}))

// --- Bars: under-5 mortality, latest comparators ---------------------------

export const mortalityBars: BarDatum[] = [...mortality.comparators_latest]
  .sort((a, b) => b.value - a.value)
  .map((c) => ({
    label: COUNTRY_SHORT[c.code] ?? c.country,
    value: c.value,
    emphasis: c.code === 'ZMB',
  }))

// --- Scatter: cereal yield vs fertilizer (yearly) --------------------------

export const yieldScatter: ScatterPoint[] = yieldFert.points.map((p) => ({
  x: p.x,
  y: p.y,
  label: String(p.year),
}))

// --- Live: ZMW/USD daily closes --------------------------------------------

/** Sparkline series (sequential index x); `label` is the ISO date. */
export const fxLine: LinePoint[] = exchange.points.map((p, i) => ({
  x: i,
  y: p.y,
  label: p.x,
}))

/** Latest close — the big mono figure LiveFeed shows (4.3 will drive `current` live). */
export const fxCurrent: number = exchange.points[exchange.points.length - 1].y

// --- Accessible table models (one per chart; captions cite the source) -----

const TABLES: Record<string, TableModel> = {
  'maize-prices': {
    caption: `Maize meal retail price, ZMW per kg, monthly. Source: ${maize.source}.`,
    columns: [
      { key: 'month', label: 'Month' },
      { key: 'price', label: 'ZMW/kg', numeric: true },
      { key: 'markets', label: 'Markets', numeric: true },
    ],
    rows: maize.points.map((p) => ({
      month: monthLabel(p.x),
      price: p.y.toFixed(2),
      markets: p.n,
    })),
  },
  'under5-mortality': {
    caption: `Under-5 mortality, deaths per 1,000 live births, latest year by country. Source: ${mortality.source}.`,
    columns: [
      { key: 'country', label: 'Country' },
      { key: 'value', label: 'Per 1,000', numeric: true },
      { key: 'year', label: 'Year', numeric: true },
    ],
    rows: [...mortality.comparators_latest]
      .sort((a, b) => b.value - a.value)
      .map((c) => ({ country: c.country, value: c.value.toFixed(1), year: c.year })),
  },
  'yield-fertilizer': {
    caption: `Cereal yield vs fertilizer consumption, yearly, Zambia. Source: ${yieldFert.source}.`,
    columns: [
      { key: 'year', label: 'Year', numeric: true },
      { key: 'fert', label: 'Fertilizer kg/ha', numeric: true },
      { key: 'yield', label: 'Yield kg/ha', numeric: true },
    ],
    rows: yieldFert.points.map((p) => ({
      year: p.year,
      fert: p.x.toFixed(1),
      yield: p.y.toFixed(0),
    })),
  },
  'exchange-rate': {
    caption: `ZMW per USD, daily closes (simulated live feed). Source: ${exchange.source}.`,
    columns: [
      { key: 'date', label: 'Date' },
      { key: 'rate', label: 'ZMW/USD', numeric: true },
    ],
    rows: exchange.points.map((p) => ({ date: p.x, rate: p.y.toFixed(4) })),
  },
}

/** The accessible table model for a chart id (for the "View as table" toggle). */
export function tableFor(chartId: string): TableModel | undefined {
  return TABLES[chartId]
}
