/**
 * surfaces.ts — the focus-scoped tool family for each chart.
 *
 * `registry.focus(id)` only registers a family for a surface that was previously
 * registered, so every chart id needs a `SurfaceDef` here. Item 3.2 fills each
 * family with real query tools whose `execute` computes from the imported JSON
 * (never a hardcoded paraphrase — refetch the data and the figures stay correct),
 * returns speech with exact figures + units + source, ends with a natural
 * next-step suggestion, and emits a `MirrorHighlightEvent` so the focused hero
 * paints the answer (gold band / point glow / bar ring / scatter ring).
 *
 * Tool families by chart kind:
 *  - maize-prices (line): query_point, query_range, find_extremes, describe_trend
 *  - under5-mortality (line + comparators): query_point, find_extremes,
 *    describe_trend, compare_countries
 *  - yield-fertilizer (scatter): describe_relationship, query_nearest
 *  - exchange-rate (live): current_value, session_stats
 */

import type { SurfaceDef, ToolDef, MirrorEvent } from '../lib/agent-a11y'
import { registry } from '../lib/agent-a11y'
import {
  CHARTS,
  getChart,
  maize,
  mortality,
  yieldFert,
  exchange,
  fmtMonth,
  round,
  minBy,
  maxBy,
  pearson,
  type ChartMeta,
} from './charts.ts'
import { getCurrentRate, getSessionStats, getLiveValues } from './liveFeed.ts'
import { monthIndexOf } from '../charts/data.ts'
import { hlPoint, hlRange, barEmphasis, scatterRing } from '../charts/highlight.ts'
import { isAudioReady, sonifySeries } from '../sonify.ts'

/** The starter/describe tool name for a chart family, e.g. `maize-prices_describe_trend`. */
export function describeTrendToolName(chartId: string): string {
  return `${chartId}_describe_trend`
}

// --- Short source tags for speech (unit + provenance without a URL) ---------

const SRC = {
  maize: 'WFP retail prices via HDX',
  mortality: 'World Bank, under-5 mortality',
  yield: 'World Bank cereal-yield & fertilizer',
  exchange: 'fawazahmed0 currency-api (simulated live)',
} as const

// --- Small arg coercion helpers --------------------------------------------

/** "2025", "2025-1", "2025-01" → "2025-01"; anything falsy → "". */
function normalizeYm(raw: unknown): string {
  const s = String(raw ?? '').trim()
  if (!s) return ''
  const [y, m] = s.split('-')
  if (!/^\d{4}$/.test(y)) return ''
  const mm = m ? String(Math.min(12, Math.max(1, Number(m)))).padStart(2, '0') : '01'
  return `${y}-${mm}`
}

function toNum(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

/** Points of a numeric series (x,y) inside an inclusive x-window (nulls = open). */
function within<T>(items: readonly T[], xOf: (t: T) => number, lo: number | null, hi: number | null): T[] {
  return items.filter((t) => {
    const x = xOf(t)
    return (lo === null || x >= lo) && (hi === null || x <= hi)
  })
}

// --- Sonify (item 4.1): "hear the shape" for the ordered line/live series ---

/** A mirror event the rail uses to animate its sonification bar for a while. */
function sonifyMirror(chartId: string, durationMs: number): MirrorEvent {
  return { kind: 'sonify', chartId, durationMs }
}

/** The resolved series + peak labels a single sonify pass sweeps. */
interface SonifyResolved {
  /** Numeric series to sweep, in draw order. */
  values: number[]
  /** Spoken period, e.g. "2015–2025" or "30 recent closes". */
  period: string
  /** Peak value already formatted with its unit, e.g. "12.11 ZMW/kg". */
  peakWithUnit: string
  /** Where the peak falls, e.g. "Jan 2025" or "the year 2000". */
  peakLabel: string
}

/** What each sonifiable chart needs to narrate its sweep + name its true peak. */
interface SonifySpec extends SonifyResolved {
  /**
   * Optional honesty note when a higher value is not "better" (mortality):
   * the pitch maps value→frequency, so the loudest/highest tone is the worst
   * year, not the best — say so.
   */
  peakCaveat?: string
  /**
   * Optional live resolver: when present it is called at execute time so the
   * sweep reflects state that grows during the session (the exchange feed reads
   * its accumulated ticks here; every other chart is static). Falls back to the
   * static fields above when it returns fewer points than the baseline.
   */
  dynamic?: () => SonifyResolved
}

/**
 * Build the `<chartId>_sonify` tool. It plays the focused chart's series as a
 * ~3-second pitch sweep (220–880 Hz), pings the true peak, animates the rail
 * bar for the duration, and narrates the real peak. If audio is not yet armed
 * (the AudioContext is suspended pending a user gesture) it does NOT throw —
 * it returns a narrated result telling the user to press "Enable sound" first.
 */
function sonifyTool(chartId: string, spec: SonifySpec): ToolDef {
  return {
    name: `${chartId}_sonify`,
    description:
      'Play this chart as sound — a ~3-second tone sweep where pitch rises with the ' +
      'value (220–880 Hz), with a louder octave ping at the series peak so you can ' +
      'hear where the maximum lands. Needs on-page audio to be enabled first. Ask ' +
      'describe_trend to hear the same shape in words.',
    inputSchema: { type: 'object', properties: {} },
    argsSummary: () => `${chartId}_sonify()`,
    execute: () => {
      if (!isAudioReady()) {
        return {
          speech:
            'Press the "Enable sound" button on the page first (browsers only start ' +
            'audio from a click), then ask me to play it as sound.',
          data: { ok: false, needsAudio: true, chartId },
        }
      }
      // Resolve the live series if this chart accumulates one (exchange feed).
      const resolved: SonifyResolved = spec.dynamic ? spec.dynamic() : spec
      const { durationMs } = sonifySeries(resolved.values)
      const secs = Math.round(durationMs / 100) / 10
      const caveat = spec.peakCaveat ? ` ${spec.peakCaveat}` : ''
      const speech =
        `Playing ${resolved.period} as sound — ${resolved.values.length} points over ~${secs} seconds. ` +
        `The tone rises with the value; listen for the loud ping at the peak: ` +
        `${resolved.peakWithUnit} in ${resolved.peakLabel}.${caveat} Ask describe_trend to hear the shape in words.`
      return {
        speech,
        data: { ok: true, chartId, points: resolved.values.length, durationMs, peak: resolved.peakWithUnit, peakAt: resolved.peakLabel },
        mirror: sonifyMirror(chartId, durationMs),
      }
    },
  }
}

// --- maize-prices (line) ----------------------------------------------------

/** The real 2022-08 → 2023-11 methodology gap, derived from the data. */
function maizeGap(): { before: (typeof maize.points)[number]; after: (typeof maize.points)[number]; months: number } {
  const pts = maize.points
  let gi = 1
  let best = 0
  for (let i = 1; i < pts.length; i++) {
    const d = monthIndexOf(pts[i].x) - monthIndexOf(pts[i - 1].x)
    if (d > best) {
      best = d
      gi = i
    }
  }
  return { before: pts[gi - 1], after: pts[gi], months: best }
}

function maizeFamily(): ToolDef[] {
  const pts = maize.points
  const peak = maxBy(pts, (p) => p.y)
  const first = pts[0]
  const last = pts[pts.length - 1]
  const gap = maizeGap()

  return [
    {
      name: 'maize-prices_query_point',
      description:
        'Look up the maize-meal retail price for one month (YYYY-MM). Returns the ' +
        'nearest reading with ZMW/kg and whether it is the decade peak. Try ' +
        'find_extremes for the peak, or query_range for a change over time.',
      inputSchema: {
        type: 'object',
        properties: { date: { type: 'string', description: 'Month as "YYYY-MM", e.g. "2025-01".' } },
        required: ['date'],
      },
      argsSummary: (a) => `maize-prices_query_point(${normalizeYm((a as { date?: unknown }).date) || '?'})`,
      execute: (a) => {
        const ym = normalizeYm((a as { date?: unknown }).date)
        if (!ym) {
          return {
            speech: 'Give a month as "YYYY-MM", e.g. "2025-01". You can also ask describe_trend for the full shape.',
            data: { ok: false },
          }
        }
        const target = monthIndexOf(ym)
        const nearest = minBy(pts, (p) => Math.abs(monthIndexOf(p.x) - target))
        const exact = monthIndexOf(nearest.x) === target
        const inGap = target > monthIndexOf(gap.before.x) && target < monthIndexOf(gap.after.x)
        const isPeak = nearest.x === peak.x
        const gapNote = !exact && inGap
          ? ` That month falls in the ${fmtMonth(gap.before.x)}→${fmtMonth(gap.after.x)} WFP data gap (a methodology change, not interpolated), so the nearest reading is ${fmtMonth(nearest.x)}.`
          : !exact
            ? ` No exact reading for ${fmtMonth(ym)}; nearest is ${fmtMonth(nearest.x)}.`
            : ''
        const peakNote = isPeak ? ' That is the decade peak.' : ''
        const speech =
          `In ${fmtMonth(nearest.x)}, maize meal was ${round(nearest.y)} ZMW/kg ` +
          `(${SRC.maize}).${gapNote}${peakNote} ` +
          'You can ask query_range for a change over time, or find_extremes for the peak.'
        return {
          speech,
          data: { ok: true, month: fmtMonth(nearest.x), price: nearest.y, unit: 'ZMW/kg', exact, isPeak, source: maize.source },
          mirror: hlPoint('maize-prices', monthIndexOf(nearest.x), `${round(nearest.y)} ZMW/kg`, fmtMonth(nearest.x)),
        }
      },
    },
    {
      name: 'maize-prices_query_range',
      description:
        'Compare the maize price across a date range (start, end as YYYY-MM). Returns ' +
        'start/end values, percent change, and the min & max within the window. Ask ' +
        'find_extremes for the all-time peak, or describe_trend for the full story.',
      inputSchema: {
        type: 'object',
        properties: {
          start: { type: 'string', description: 'Start month "YYYY-MM".' },
          end: { type: 'string', description: 'End month "YYYY-MM".' },
        },
        required: ['start', 'end'],
      },
      argsSummary: (a) => {
        const s = normalizeYm((a as { start?: unknown }).start)
        const e = normalizeYm((a as { end?: unknown }).end)
        return `maize-prices_query_range(${s || '?'} … ${e || '?'})`
      },
      execute: (a) => {
        const s = normalizeYm((a as { start?: unknown }).start)
        const e = normalizeYm((a as { end?: unknown }).end)
        if (!s || !e) {
          return { speech: 'Give both start and end as "YYYY-MM". Or ask describe_trend for the whole span.', data: { ok: false } }
        }
        const lo = Math.min(monthIndexOf(s), monthIndexOf(e))
        const hi = Math.max(monthIndexOf(s), monthIndexOf(e))
        const win = within(pts, (p) => monthIndexOf(p.x), lo, hi)
        if (win.length === 0) {
          return { speech: `No maize readings between ${fmtMonth(s)} and ${fmtMonth(e)} — likely inside the data gap. Try a wider range.`, data: { ok: false } }
        }
        const a0 = win[0]
        const a1 = win[win.length - 1]
        const pct = ((a1.y - a0.y) / a0.y) * 100
        const loP = minBy(win, (p) => p.y)
        const hiP = maxBy(win, (p) => p.y)
        const dir = pct >= 0 ? 'up' : 'down'
        const speech =
          `From ${fmtMonth(a0.x)} to ${fmtMonth(a1.x)}, maize meal went ` +
          `${round(a0.y)} → ${round(a1.y)} ZMW/kg, ${dir} ${round(Math.abs(pct), 1)}% ` +
          `(${SRC.maize}). Within the window it ranged ${round(loP.y)} (${fmtMonth(loP.x)}) ` +
          `to ${round(hiP.y)} (${fmtMonth(hiP.x)}). Ask find_extremes for the all-time peak.`
        return {
          speech,
          data: { ok: true, start: fmtMonth(a0.x), end: fmtMonth(a1.x), pctChange: Number(pct.toFixed(1)), min: loP.y, max: hiP.y, unit: 'ZMW/kg' },
          mirror: hlRange('maize-prices', monthIndexOf(a0.x), monthIndexOf(a1.x), `${pct >= 0 ? '+' : ''}${round(pct, 1)}%`),
        }
      },
    },
    {
      name: 'maize-prices_find_extremes',
      description:
        'Find the lowest and highest maize price over the whole series or an optional ' +
        'window (start/end as YYYY-MM). Returns both with their months. Ask query_range ' +
        'for a specific change, or describe_trend for the full arc.',
      inputSchema: {
        type: 'object',
        properties: {
          start: { type: 'string', description: 'Optional start "YYYY-MM".' },
          end: { type: 'string', description: 'Optional end "YYYY-MM".' },
        },
      },
      argsSummary: (a) => {
        const s = normalizeYm((a as { start?: unknown }).start)
        const e = normalizeYm((a as { end?: unknown }).end)
        return s || e ? `maize-prices_find_extremes(${s || '…'} … ${e || '…'})` : 'maize-prices_find_extremes(all)'
      },
      execute: (a) => {
        const s = normalizeYm((a as { start?: unknown }).start)
        const e = normalizeYm((a as { end?: unknown }).end)
        const lo = s ? monthIndexOf(s) : null
        const hi = e ? monthIndexOf(e) : null
        const win = within(pts, (p) => monthIndexOf(p.x), lo, hi)
        const set = win.length ? win : pts
        const mn = minBy(set, (p) => p.y)
        const mx = maxBy(set, (p) => p.y)
        const scope = s || e ? `${fmtMonth(s || first.x)}–${fmtMonth(e || last.x)}` : '2015–2025'
        const speech =
          `Over ${scope}, maize meal ranged from a low of ${round(mn.y)} ZMW/kg in ` +
          `${fmtMonth(mn.x)} to a high of ${round(mx.y)} in ${fmtMonth(mx.x)} (${SRC.maize}). ` +
          'You can ask describe_trend for the full shape, or query_range for a change.'
        return {
          speech,
          data: { ok: true, min: { month: fmtMonth(mn.x), value: mn.y }, max: { month: fmtMonth(mx.x), value: mx.y }, unit: 'ZMW/kg' },
          mirror: hlPoint('maize-prices', monthIndexOf(mx.x), `${round(mx.y)} ZMW/kg`, `peak · ${fmtMonth(mx.x)}`),
        }
      },
    },
    {
      name: describeTrendToolName('maize-prices'),
      description:
        'Narrate the full shape of the maize-meal price line: the multi-fold rise, its ' +
        'drivers, and the real data gap. Then ask query_point, query_range, or ' +
        'find_extremes to drill in.',
      inputSchema: { type: 'object', properties: {} },
      argsSummary: () => 'maize-prices_describe_trend()',
      execute: () => {
        const ratio = round(peak.y / first.y, 1)
        const speech =
          `Maize meal climbed about ${ratio}× — from ${round(first.y)} ZMW/kg in ${fmtMonth(first.x)} ` +
          `to a ${round(peak.y)} peak in ${fmtMonth(peak.x)} — driven by the 2022 kwacha slide and the ` +
          `2023–24 El Niño drought, easing to ${round(last.y)} by ${fmtMonth(last.x)} after the 2025 harvest ` +
          `(${SRC.maize}). Note the ${fmtMonth(gap.before.x)}→${fmtMonth(gap.after.x)} gap — a WFP methodology ` +
          'change, left un-interpolated. Ask find_extremes for the peak, or query_range for any window.'
        return {
          speech,
          data: { id: 'maize-prices', headline: getChart('maize-prices')?.headline(), riseFactor: Number(ratio), gapMonths: gap.months },
          mirror: hlRange('maize-prices', monthIndexOf(first.x), monthIndexOf(last.x), `${ratio}× rise`),
        }
      },
    },
    sonifyTool('maize-prices', {
      values: pts.map((p) => p.y),
      period: `${fmtMonth(first.x).split(' ')[1]}–${fmtMonth(last.x).split(' ')[1]}`,
      peakWithUnit: `${round(peak.y)} ZMW/kg`,
      peakLabel: fmtMonth(peak.x),
    }),
  ]
}

// --- under5-mortality (line + comparators) ----------------------------------

function mortalityFamily(): ToolDef[] {
  const s = mortality.zambia_series
  const first = s[0]
  const last = s[s.length - 1]
  const cmp = [...mortality.comparators_latest].sort((c1, c2) => c2.value - c1.value)

  return [
    {
      name: 'under5-mortality_query_point',
      description:
        "Look up Zambia's under-5 mortality for one year. Returns deaths per 1,000 live " +
        'births for the nearest year. Ask find_extremes for the halving, or ' +
        'compare_countries to see Zambia against its peers.',
      inputSchema: {
        type: 'object',
        properties: { year: { type: 'number', description: 'Calendar year, e.g. 2010.' } },
        required: ['year'],
      },
      argsSummary: (a) => `under5-mortality_query_point(${toNum((a as { year?: unknown }).year) ?? '?'})`,
      execute: (a) => {
        const year = toNum((a as { year?: unknown }).year)
        if (year === null) {
          return { speech: 'Give a year, e.g. 2010. Or ask describe_trend for the whole decline.', data: { ok: false } }
        }
        const near = minBy(s, (p) => Math.abs(p.x - year))
        const exactNote = near.x === year ? '' : ` (nearest year to ${year})`
        const speech =
          `In ${near.x}, Zambia's under-5 mortality was ${round(near.y, 1)} deaths per 1,000 live births` +
          `${exactNote} (${SRC.mortality}). Ask find_extremes for the halving, or compare_countries for peers.`
        return {
          speech,
          data: { ok: true, year: near.x, value: near.y, unit: 'deaths per 1,000 live births', source: mortality.source },
          mirror: hlPoint('under5-mortality', near.x, `${round(near.y, 1)} per 1,000`, String(near.x)),
        }
      },
    },
    {
      name: 'under5-mortality_find_extremes',
      description:
        "Report the start and end of Zambia's under-5 mortality series — the halving " +
        'story — with both years and values. Ask compare_countries for the peer ranking.',
      inputSchema: { type: 'object', properties: {} },
      argsSummary: () => 'under5-mortality_find_extremes()',
      execute: () => {
        const hi = maxBy(s, (p) => p.y)
        const lo = minBy(s, (p) => p.y)
        const pct = ((lo.y - hi.y) / hi.y) * 100
        const speech =
          `Zambia's under-5 mortality fell from its high of ${round(hi.y, 1)} in ${hi.x} to ${round(lo.y, 1)} ` +
          `deaths per 1,000 in ${lo.x} — down ${round(Math.abs(pct), 0)}%, more than a halving (${SRC.mortality}). ` +
          'Ask compare_countries to place Zambia among its peers.'
        return {
          speech,
          data: { ok: true, high: { year: hi.x, value: hi.y }, low: { year: lo.x, value: lo.y }, pctChange: Number(pct.toFixed(0)) },
          mirror: hlRange('under5-mortality', hi.x, lo.x, `${round(pct, 0)}%`),
        }
      },
    },
    {
      name: describeTrendToolName('under5-mortality'),
      description:
        "Narrate Zambia's under-5 mortality decline (2000–2024) — a genuine public-health " +
        'gain. Ask compare_countries for peers, or query_point for one year.',
      inputSchema: { type: 'object', properties: {} },
      argsSummary: () => 'under5-mortality_describe_trend()',
      execute: () => {
        const speech =
          `Zambia's under-5 mortality more than halved, from ${round(first.y, 1)} deaths per 1,000 in ${first.x} ` +
          `to ${round(last.y, 1)} in ${last.x} — a steady, genuine public-health gain (${SRC.mortality}). ` +
          'Ask compare_countries to see where that leaves Zambia among African peers.'
        return {
          speech,
          data: { id: 'under5-mortality', headline: getChart('under5-mortality')?.headline() },
          mirror: hlRange('under5-mortality', first.x, last.x, 'halved'),
        }
      },
    },
    sonifyTool('under5-mortality', {
      values: s.map((p) => p.y),
      period: `${first.x}–${last.x}`,
      peakWithUnit: `${round(maxBy(s, (p) => p.y).y, 1)} per 1,000`,
      peakLabel: `the year ${maxBy(s, (p) => p.y).x}`,
      peakCaveat:
        'Here a higher tone means worse, so the loudest ping is the pre-decline high — the tone then falls as mortality improves.',
    }),
    {
      name: 'under5-mortality_compare_countries',
      description:
        "Rank Zambia's latest under-5 mortality against African peers (World Bank 2024) " +
        'and say where Zambia sits. Emphasises the Zambia comparator bar. Ask ' +
        'describe_trend for the time story.',
      inputSchema: { type: 'object', properties: {} },
      argsSummary: () => 'under5-mortality_compare_countries()',
      execute: () => {
        const zi = cmp.findIndex((c) => c.code === 'ZMB')
        const zam = cmp[zi]
        const above = cmp[zi - 1] // higher value (worse)
        const below = cmp[zi + 1] // lower value (better)
        const rank = zi + 1
        const speech =
          `Zambia ${round(zam.value, 1)} sits mid-pack — ${rank}th of ${cmp.length} (${zam.year}): ` +
          `below ${above.country} ${round(above.value, 1)} and DR Congo ${round(cmp.find((c) => c.code === 'COD')!.value, 1)}, ` +
          `above ${below.country} ${round(below.value, 1)} and Tanzania ${round(cmp.find((c) => c.code === 'TZA')!.value, 1)} ` +
          `(${SRC.mortality}, per 1,000 live births). Ask describe_trend for how Zambia got here.`
        return {
          speech,
          data: { ok: true, rank, of: cmp.length, zambia: zam.value, ranking: cmp.map((c) => ({ country: c.country, value: c.value })) },
          mirror: barEmphasis('under5-mortality', 'Zambia', `${round(zam.value, 1)} per 1,000`, `mid-pack · ${rank} of ${cmp.length}`),
        }
      },
    },
  ]
}

// --- yield-fertilizer (scatter) ---------------------------------------------

function yieldFamily(): ToolDef[] {
  const pts = yieldFert.points
  const rAll = pearson(pts.map((p) => p.x), pts.map((p) => p.y))
  const post2000 = pts.filter((p) => p.year >= 2000)
  const rRecent = pearson(post2000.map((p) => p.x), post2000.map((p) => p.y))
  const first = pts[0]
  const last = pts[pts.length - 1]
  const maxFert = maxBy(pts, (p) => p.x)

  return [
    {
      name: 'yield-fertilizer_describe_relationship',
      description:
        'Compute and explain the fertilizer→yield relationship for Zambia: the Pearson ' +
        'correlation over the full window and since 2000, with the rain-dependent caveat. ' +
        'Ask query_nearest for a specific year.',
      inputSchema: { type: 'object', properties: {} },
      argsSummary: () => 'yield-fertilizer_describe_relationship()',
      execute: () => {
        const speech =
          `Fertilizer use and cereal yield in Zambia are positively but loosely linked: ` +
          `Pearson r≈${round(rAll, 2)} over ${first.year}–${last.year} (r≈${round(rRecent, 2)} since 2000). ` +
          `It is real but rain-dependent — even at the ${round(maxFert.x)} kg/ha fertilizer peak (${maxFert.year}), ` +
          `yield was only ${round(maxFert.y)} kg/ha, so wet-year outliers scatter the cloud (${SRC.yield}). ` +
          'Ask query_nearest for any single year.'
        return {
          speech,
          data: { ok: true, rFull: Number(round(rAll, 2)), rSince2000: Number(round(rRecent, 2)), window: `${first.year}–${last.year}` },
          mirror: scatterRing('yield-fertilizer', maxFert.year, `r≈${round(rAll, 2)}`, `${round(maxFert.x)} kg/ha fert → ${round(maxFert.y)} kg/ha yield`),
        }
      },
    },
    {
      name: 'yield-fertilizer_query_nearest',
      description:
        'Return the fertilizer/yield point for a given year (or nearest fertilizer x / ' +
        'yield y). Rings that dot. Ask describe_relationship for the overall correlation.',
      inputSchema: {
        type: 'object',
        properties: {
          year: { type: 'number', description: 'Calendar year, e.g. 2010.' },
          x: { type: 'number', description: 'Optional: fertilizer kg/ha to match instead.' },
          y: { type: 'number', description: 'Optional: cereal yield kg/ha to match instead.' },
        },
      },
      argsSummary: (a) => {
        const y = toNum((a as { year?: unknown }).year)
        const x = toNum((a as { x?: unknown }).x)
        const yy = toNum((a as { y?: unknown }).y)
        if (y !== null) return `yield-fertilizer_query_nearest(${y})`
        if (x !== null) return `yield-fertilizer_query_nearest(x:${x})`
        if (yy !== null) return `yield-fertilizer_query_nearest(y:${yy})`
        return 'yield-fertilizer_query_nearest(latest)'
      },
      execute: (a) => {
        const yr = toNum((a as { year?: unknown }).year)
        const x = toNum((a as { x?: unknown }).x)
        const yy = toNum((a as { y?: unknown }).y)
        let pt = last
        let how = 'latest year'
        if (yr !== null) {
          pt = minBy(pts, (p) => Math.abs(p.year - yr))
          how = `nearest year to ${yr}`
        } else if (x !== null) {
          pt = minBy(pts, (p) => Math.abs(p.x - x))
          how = `nearest fertilizer to ${round(x)} kg/ha`
        } else if (yy !== null) {
          pt = minBy(pts, (p) => Math.abs(p.y - yy))
          how = `nearest yield to ${round(yy)} kg/ha`
        }
        const speech =
          `In ${pt.year} (${how}), Zambia used ${round(pt.x)} kg/ha of fertilizer for a cereal yield of ` +
          `${round(pt.y)} kg/ha (${SRC.yield}). Ask describe_relationship for the overall correlation.`
        return {
          speech,
          data: { ok: true, year: pt.year, fertilizer: pt.x, yield: pt.y, units: { x: 'kg/ha', y: 'kg/ha' } },
          mirror: scatterRing('yield-fertilizer', pt.year, `${round(pt.y)} kg/ha yield`, `${round(pt.x)} kg/ha fertilizer · ${pt.year}`),
        }
      },
    },
  ]
}

// --- exchange-rate (live) ---------------------------------------------------

function exchangeFamily(): ToolDef[] {
  // Read the SESSION-LOCAL live state at build time. `refreshExchangeSurface()`
  // rebuilds this family on every tick, so `current_value`'s DESCRIPTION carries
  // the latest rate and getTools() visibly changes over the session.
  const rate = getCurrentRate()
  const liveValues = getLiveValues()
  const livePeak = liveValues.reduce((m, v) => (v > m ? v : m), liveValues[0])

  return [
    {
      name: 'exchange-rate_current_value',
      description:
        `Get the live ZMW/USD rate — last tick ${round(rate, 2)} (simulated feed, re-registered every tick). ` +
        "Ask session_stats for this session's range.",
      inputSchema: { type: 'object', properties: {} },
      argsSummary: () => 'exchange-rate_current_value()',
      execute: () => {
        const s = getSessionStats()
        const speech =
          `The live ZMW/USD rate is ${round(s.current, 2)} (${SRC.exchange}). ` +
          `This session has ticked ${s.tickCount} time${s.tickCount === 1 ? '' : 's'} from the real seed ${round(s.seed, 2)}. ` +
          'This tool re-registers each tick, so its listing in getTools() changes over time. Ask session_stats for the range.'
        return {
          speech,
          data: { ok: true, value: s.current, ticks: s.tickCount, seed: s.seed, unit: 'ZMW/USD', simulated: exchange.live_simulated },
          mirror: hlPoint('exchange-rate', 0, `${round(s.current, 2)} ZMW/USD`, `live · tick ${s.tickCount}`),
        }
      },
    },
    {
      name: 'exchange-rate_session_stats',
      description:
        "Summarise THIS browsing session's ZMW/USD feed: ticks seen, min, max and range — " +
        'state that exists only in your session and is in no dataset. Ask current_value for the latest tick.',
      inputSchema: { type: 'object', properties: {} },
      argsSummary: () => 'exchange-rate_session_stats()',
      execute: () => {
        const s = getSessionStats()
        const secs = Math.round(s.elapsedMs / 1000)
        const seen =
          s.tickCount === 0
            ? 'No ticks yet this session'
            : `This session has seen ${s.tickCount} tick${s.tickCount === 1 ? '' : 's'} over ~${secs}s`
        const speech =
          `${seen}. The rate ranged ${round(s.min, 2)}–${round(s.max, 2)} ZMW/USD ` +
          `(range ${round(s.range, 2)}), now ${round(s.current, 2)}, walking from the real seed ${round(s.seed, 2)} (${SRC.exchange}). ` +
          'These values exist only in your browser session — no offline model or dataset has them. Ask current_value for the latest tick.'
        return {
          speech,
          data: { ok: true, ticks: s.tickCount, min: s.min, max: s.max, range: Number(round(s.range, 2)), current: s.current, seed: s.seed, elapsedMs: s.elapsedMs, unit: 'ZMW/USD' },
          mirror: hlPoint('exchange-rate', 0, `${round(s.min, 2)}–${round(s.max, 2)} ZMW/USD`, `${s.tickCount} ticks · range ${round(s.range, 2)}`),
        }
      },
    },
    sonifyTool('exchange-rate', {
      values: liveValues,
      period: `${liveValues.length} closes`,
      peakWithUnit: `${round(livePeak, 2)} ZMW/USD`,
      peakLabel: 'the live feed',
      // Read the session-accumulated buffer at play time so a grown feed is heard.
      dynamic: () => {
        const v = getLiveValues()
        const pk = v.reduce((m, x) => (x > m ? x : m), v[0])
        return {
          values: v,
          period: `${v.length} closes incl. this session's ticks`,
          peakWithUnit: `${round(pk, 2)} ZMW/USD`,
          peakLabel: 'the live feed',
        }
      },
    }),
  ]
}

// --- Family assembly --------------------------------------------------------

const FAMILIES: Record<string, () => ToolDef[]> = {
  'maize-prices': maizeFamily,
  'under5-mortality': mortalityFamily,
  'yield-fertilizer': yieldFamily,
  'exchange-rate': exchangeFamily,
}

/** The focus-scoped surface definition for one chart. */
export function surfaceFor(chart: ChartMeta): SurfaceDef {
  const build = FAMILIES[chart.id]
  return {
    describe: `${chart.title} — ${chart.unit}, ${chart.period}.`,
    tools: build ? build() : [],
  }
}

/** Every chart's surface def, keyed by chart id. */
export const CHART_SURFACES: Record<string, SurfaceDef> = Object.fromEntries(
  CHARTS.map((chart) => [chart.id, surfaceFor(chart)]),
)

/**
 * Re-register the exchange family so `current_value`'s live description (and the
 * tools' session-local answers) reflect the latest tick. `registry.registerSurface`
 * re-applies the family only while exchange-rate is focused — cleanly aborting the
 * old family's controller and registering the fresh one, so `getTools()` shows the
 * new description with a constant tool COUNT and no listener leak. When not focused
 * it just updates the stored def for the next focus. Called on each live-feed tick.
 */
export function refreshExchangeSurface(): void {
  const chart = getChart('exchange-rate')
  if (chart) registry.registerSurface('exchange-rate', surfaceFor(chart))
}

/** Registered tool names a chart's family exposes while focused (order preserved). */
export function toolNamesFor(chartId: string): string[] {
  return CHART_SURFACES[chartId]?.tools.map((t) => t.name) ?? []
}

/** How many tools a chart's family exposes while focused. */
export function toolCountFor(chartId: string): number {
  return CHART_SURFACES[chartId]?.tools.length ?? 0
}

// Re-export for convenience so integration code has one import site.
export { getChart }
