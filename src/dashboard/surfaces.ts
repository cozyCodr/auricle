/**
 * surfaces.ts — the focus-scoped tool family for each commissioned view.
 *
 * In the workspace arc, NO chart surface exists at boot: `create_view`
 * (see `workspace.ts`) registers a surface + family at runtime when a view is
 * commissioned, and `registry.focus(id)` swaps which family is live. Every tool
 * `execute` computes from the imported JSON (never a hardcoded paraphrase —
 * refetch the data and the figures stay correct), returns speech with exact
 * figures + units + source, ends with a natural next-step suggestion, and emits
 * a `MirrorHighlightEvent` so the focused hero paints the answer (gold band /
 * point glow / bar ring / scatter ring).
 *
 * Tool families by chart kind:
 *  - temp-anomaly (line, hero): query_point, query_range, find_extremes,
 *    describe_trend, sonify
 *  - co2-emitters (line + bars): query_point, query_range, find_extremes,
 *    describe_trend, compare_emitters, sonify
 *  - wealth-carbon (scatter): describe_relationship, query_nearest
 *  - co2-live (live): current_value, session_stats, sonify
 */

import type { SurfaceDef, ToolDef, MirrorEvent } from '../lib/agent-a11y'
import { registry } from '../lib/agent-a11y'
import {
  getChart,
  tempAnomaly,
  emitters,
  wealthCarbon,
  co2Live,
  round,
  fmtInt,
  fmtAnomaly,
  minBy,
  maxBy,
  pearson,
  type ChartMeta,
} from './charts.ts'
import { getCurrentRate, getSessionStats, getLiveValues } from './liveFeed.ts'
import { hlPoint, hlRange, barEmphasis, scatterRing } from '../charts/highlight.ts'
import { isAudioReady, sonifySeries } from '../sonify.ts'

/** The starter/describe tool name for a chart family, e.g. `temp-anomaly_describe_trend`. */
export function describeTrendToolName(chartId: string): string {
  return `${chartId}_describe_trend`
}

// --- Short source tags for speech (unit + provenance without a URL) ---------

const SRC = {
  temp: 'NASA GISTEMP v4',
  emitters: 'Our World in Data / Global Carbon Budget',
  wealth: 'OWID — Global Carbon Budget + Maddison Project',
  live: 'NOAA Mauna Loa weekly means (simulated live)',
} as const

// --- Small arg coercion helpers --------------------------------------------

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

// --- Sonify: "hear the shape" for the ordered line/live series --------------

/** A mirror event the rail uses to animate its sonification bar for a while. */
function sonifyMirror(chartId: string, durationMs: number): MirrorEvent {
  return { kind: 'sonify', chartId, durationMs }
}

/** The resolved series + peak labels a single sonify pass sweeps. */
interface SonifyResolved {
  /** Numeric series to sweep, in draw order. */
  values: number[]
  /** Spoken period, e.g. "1880–2025" or "76 weekly means". */
  period: string
  /** Peak value already formatted with its unit, e.g. "+1.28 °C". */
  peakWithUnit: string
  /** Where the peak falls, e.g. "2024". */
  peakLabel: string
}

/** What each sonifiable chart needs to narrate its sweep + name its true peak. */
interface SonifySpec extends SonifyResolved {
  /** Optional honesty note about what a high tone means for this series. */
  peakCaveat?: string
  /**
   * Optional live resolver: when present it is called at execute time so the
   * sweep reflects state that grows during the session (the co2-live feed reads
   * its accumulated ticks here; every other chart is static).
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

// --- temp-anomaly (line, hero) ----------------------------------------------

function tempFamily(): ToolDef[] {
  const pts = tempAnomaly.points
  const first = pts[0]
  const last = pts[pts.length - 1]
  const peak = maxBy(pts, (p) => p.y)

  return [
    {
      name: 'temp-anomaly_query_point',
      description:
        'Look up the global temperature anomaly for one year (e.g. 1998). Returns the ' +
        'nearest annual reading in °C vs the 1951–1980 average and whether it is the ' +
        'record. Try find_extremes for the record year, or query_range for a change.',
      inputSchema: {
        type: 'object',
        properties: { year: { type: 'number', description: 'Calendar year, e.g. 1998.' } },
        required: ['year'],
      },
      argsSummary: (a) => `temp-anomaly_query_point(${toNum((a as { year?: unknown }).year) ?? '?'})`,
      execute: (a) => {
        const year = toNum((a as { year?: unknown }).year)
        if (year === null) {
          return {
            speech: 'Give a year, e.g. 1998. You can also ask describe_trend for the full 146-year shape.',
            data: { ok: false },
          }
        }
        const near = minBy(pts, (p) => Math.abs(p.x - year))
        const exactNote = near.x === year ? '' : ` (nearest year to ${year})`
        const isPeak = near.x === peak.x
        const peakNote = isPeak ? ' That is the warmest year in the instrumental record.' : ''
        const speech =
          `In ${near.x}, the global mean was ${fmtAnomaly(near.y)} °C versus the 1951–1980 average` +
          `${exactNote} (${SRC.temp}).${peakNote} ` +
          'Ask query_range for a change over time, or find_extremes for the record.'
        return {
          speech,
          data: { ok: true, year: near.x, anomaly: near.y, unit: '°C vs 1951–1980', exact: near.x === year, isPeak, source: tempAnomaly.source },
          mirror: hlPoint('temp-anomaly', near.x, `${fmtAnomaly(near.y)} °C`, String(near.x)),
        }
      },
    },
    {
      name: 'temp-anomaly_query_range',
      description:
        'Compare the temperature anomaly across a year range (start, end). Returns ' +
        'start/end anomalies, the change in °C, and the min & max within the window. ' +
        'Ask find_extremes for the record, or describe_trend for the full story.',
      inputSchema: {
        type: 'object',
        properties: {
          start: { type: 'number', description: 'Start year, e.g. 1950.' },
          end: { type: 'number', description: 'End year, e.g. 2024.' },
        },
        required: ['start', 'end'],
      },
      argsSummary: (a) => {
        const s = toNum((a as { start?: unknown }).start)
        const e = toNum((a as { end?: unknown }).end)
        return `temp-anomaly_query_range(${s ?? '?'} … ${e ?? '?'})`
      },
      execute: (a) => {
        const s = toNum((a as { start?: unknown }).start)
        const e = toNum((a as { end?: unknown }).end)
        if (s === null || e === null) {
          return { speech: 'Give both start and end years, e.g. 1950 and 2024. Or ask describe_trend for the whole span.', data: { ok: false } }
        }
        const lo = Math.min(s, e)
        const hi = Math.max(s, e)
        const win = within(pts, (p) => p.x, lo, hi)
        if (win.length === 0) {
          return { speech: `No annual readings between ${lo} and ${hi} — the record runs ${first.x}–${last.x}. Try a range inside it.`, data: { ok: false } }
        }
        const a0 = win[0]
        const a1 = win[win.length - 1]
        const delta = a1.y - a0.y
        const loP = minBy(win, (p) => p.y)
        const hiP = maxBy(win, (p) => p.y)
        const dir = delta >= 0 ? 'warmed' : 'cooled'
        const speech =
          `From ${a0.x} to ${a1.x}, the global mean ${dir} by ${round(Math.abs(delta), 2)} °C: ` +
          `${fmtAnomaly(a0.y)} → ${fmtAnomaly(a1.y)} °C vs 1951–1980 (${SRC.temp}). Within the window it ` +
          `ranged ${fmtAnomaly(loP.y)} (${loP.x}) to ${fmtAnomaly(hiP.y)} (${hiP.x}). ` +
          'Ask find_extremes for the all-time record.'
        return {
          speech,
          data: { ok: true, start: a0.x, end: a1.x, deltaC: Number(delta.toFixed(2)), min: loP.y, max: hiP.y, unit: '°C vs 1951–1980' },
          mirror: hlRange('temp-anomaly', a0.x, a1.x, `${delta >= 0 ? '+' : '−'}${round(Math.abs(delta), 2)} °C`),
        }
      },
    },
    {
      name: 'temp-anomaly_find_extremes',
      description:
        'Find the coldest and warmest years over the whole record or an optional year ' +
        'window (start/end). Returns both with their anomalies. Ask query_range for a ' +
        'specific change, or describe_trend for the full arc.',
      inputSchema: {
        type: 'object',
        properties: {
          start: { type: 'number', description: 'Optional start year.' },
          end: { type: 'number', description: 'Optional end year.' },
        },
      },
      argsSummary: (a) => {
        const s = toNum((a as { start?: unknown }).start)
        const e = toNum((a as { end?: unknown }).end)
        return s !== null || e !== null ? `temp-anomaly_find_extremes(${s ?? '…'} … ${e ?? '…'})` : 'temp-anomaly_find_extremes(all)'
      },
      execute: (a) => {
        const s = toNum((a as { start?: unknown }).start)
        const e = toNum((a as { end?: unknown }).end)
        const win = within(pts, (p) => p.x, s, e)
        const set = win.length ? win : pts
        const mn = minBy(set, (p) => p.y)
        const mx = maxBy(set, (p) => p.y)
        const scope = s !== null || e !== null ? `${s ?? first.x}–${e ?? last.x}` : `${first.x}–${last.x}`
        const recordNote = mx.x === peak.x ? ' — the warmest year in the entire instrumental record' : ''
        const speech =
          `Over ${scope}, the coldest year was ${mn.x} at ${fmtAnomaly(mn.y)} °C and the warmest ` +
          `was ${mx.x} at ${fmtAnomaly(mx.y)} °C${recordNote} (${SRC.temp}, vs 1951–1980). ` +
          'You can ask describe_trend for the full shape, or query_range for a change.'
        return {
          speech,
          data: { ok: true, min: { year: mn.x, anomaly: mn.y }, max: { year: mx.x, anomaly: mx.y }, unit: '°C vs 1951–1980' },
          mirror: hlPoint('temp-anomaly', mx.x, `${fmtAnomaly(mx.y)} °C`, `record · ${mx.x}`),
        }
      },
    },
    {
      name: describeTrendToolName('temp-anomaly'),
      description:
        'Narrate the full shape of the warming curve: the 19th-century baseline, the ' +
        'late-1970s zero crossing, the acceleration, and the record. Then ask ' +
        'query_point, query_range, or find_extremes to drill in.',
      inputSchema: { type: 'object', properties: {} },
      argsSummary: () => 'temp-anomaly_describe_trend()',
      execute: () => {
        const early = pts.slice(0, 20)
        const earlyMean = early.reduce((s2, p) => s2 + p.y, 0) / early.length
        const speech =
          `${pts.length} years of global temperature, ${first.x}–${last.x}: the late-1800s sit around ` +
          `${fmtAnomaly(Number(earlyMean.toFixed(2)))} °C vs the 1951–1980 average, the curve crosses zero in the ` +
          `late 1970s and then accelerates — peaking at ${fmtAnomaly(peak.y)} °C in ${peak.x}, the warmest year on ` +
          `record, with ${last.x} at ${fmtAnomaly(last.y)} (${SRC.temp}). ` +
          'Ask find_extremes for the record, or query_range for any window.'
        return {
          speech,
          data: { id: 'temp-anomaly', headline: getChart('temp-anomaly')?.headline(), record: { year: peak.x, anomaly: peak.y } },
          mirror: hlRange('temp-anomaly', first.x, last.x, `${fmtAnomaly(peak.y - earlyMean)} °C of warming`),
        }
      },
    },
    sonifyTool('temp-anomaly', {
      values: pts.map((p) => p.y),
      period: `${first.x}–${last.x}`,
      peakWithUnit: `${fmtAnomaly(peak.y)} °C`,
      peakLabel: String(peak.x),
      peakCaveat: 'Here the rising pitch IS the warming — the sweep ends near its highest tones.',
    }),
  ]
}

// --- co2-emitters (global line + top-emitter bars) ---------------------------

function emittersFamily(): ToolDef[] {
  const s = emitters.global_series
  const first = s[0]
  const last = s[s.length - 1]
  const peak = maxBy(s, (p) => p.y)
  const ranked = emitters.emitters_latest // already sorted desc by the pipeline

  return [
    {
      name: 'co2-emitters_query_point',
      description:
        'Look up global fossil CO₂ emissions for one year. Returns million tonnes for ' +
        'the nearest year. Ask compare_emitters for who emits the most today, or ' +
        'describe_trend for the full rise.',
      inputSchema: {
        type: 'object',
        properties: { year: { type: 'number', description: 'Calendar year, e.g. 1990.' } },
        required: ['year'],
      },
      argsSummary: (a) => `co2-emitters_query_point(${toNum((a as { year?: unknown }).year) ?? '?'})`,
      execute: (a) => {
        const year = toNum((a as { year?: unknown }).year)
        if (year === null) {
          return { speech: 'Give a year, e.g. 1990. Or ask describe_trend for the whole rise.', data: { ok: false } }
        }
        const near = minBy(s, (p) => Math.abs(p.x - year))
        const exactNote = near.x === year ? '' : ` (nearest year to ${year})`
        const speech =
          `In ${near.x}, the world emitted ${fmtInt(near.y)} million tonnes of fossil CO₂` +
          `${exactNote} (${SRC.emitters}). Ask compare_emitters for today's ranking, or query_range for a change.`
        return {
          speech,
          data: { ok: true, year: near.x, value: near.y, unit: 'Mt CO₂', source: emitters.source },
          mirror: hlPoint('co2-emitters', near.x, `${fmtInt(near.y)} Mt`, String(near.x)),
        }
      },
    },
    {
      name: 'co2-emitters_query_range',
      description:
        'Compare global CO₂ emissions across a year range (start, end). Returns ' +
        'start/end totals, the multiple, and min & max within the window. Ask ' +
        'compare_emitters for the country ranking.',
      inputSchema: {
        type: 'object',
        properties: {
          start: { type: 'number', description: 'Start year, e.g. 1950.' },
          end: { type: 'number', description: 'End year, e.g. 2024.' },
        },
        required: ['start', 'end'],
      },
      argsSummary: (a) => {
        const st = toNum((a as { start?: unknown }).start)
        const en = toNum((a as { end?: unknown }).end)
        return `co2-emitters_query_range(${st ?? '?'} … ${en ?? '?'})`
      },
      execute: (a) => {
        const st = toNum((a as { start?: unknown }).start)
        const en = toNum((a as { end?: unknown }).end)
        if (st === null || en === null) {
          return { speech: 'Give both start and end years, e.g. 1950 and 2024. Or ask describe_trend for the whole rise.', data: { ok: false } }
        }
        const lo = Math.min(st, en)
        const hi = Math.max(st, en)
        const win = within(s, (p) => p.x, lo, hi)
        if (win.length === 0) {
          return { speech: `No yearly readings between ${lo} and ${hi} — the series runs ${first.x}–${last.x}.`, data: { ok: false } }
        }
        const a0 = win[0]
        const a1 = win[win.length - 1]
        const factor = a1.y / a0.y
        const loP = minBy(win, (p) => p.y)
        const hiP = maxBy(win, (p) => p.y)
        const speech =
          `From ${a0.x} to ${a1.x}, global fossil CO₂ went ${fmtInt(a0.y)} → ${fmtInt(a1.y)} Mt — ` +
          `${round(factor, 1)}× (${SRC.emitters}). Within the window it ranged ${fmtInt(loP.y)} (${loP.x}) ` +
          `to ${fmtInt(hiP.y)} (${hiP.x}). Ask compare_emitters for who emits that today.`
        return {
          speech,
          data: { ok: true, start: a0.x, end: a1.x, factor: Number(factor.toFixed(1)), min: loP.y, max: hiP.y, unit: 'Mt CO₂' },
          mirror: hlRange('co2-emitters', a0.x, a1.x, `${round(factor, 1)}×`),
        }
      },
    },
    {
      name: 'co2-emitters_find_extremes',
      description:
        'Find the lowest and highest global emission years over the whole series or an ' +
        'optional window (start/end years). The high is the most recent year — emissions ' +
        'are still setting records. Ask describe_trend for the arc.',
      inputSchema: {
        type: 'object',
        properties: {
          start: { type: 'number', description: 'Optional start year.' },
          end: { type: 'number', description: 'Optional end year.' },
        },
      },
      argsSummary: (a) => {
        const st = toNum((a as { start?: unknown }).start)
        const en = toNum((a as { end?: unknown }).end)
        return st !== null || en !== null ? `co2-emitters_find_extremes(${st ?? '…'} … ${en ?? '…'})` : 'co2-emitters_find_extremes(all)'
      },
      execute: (a) => {
        const st = toNum((a as { start?: unknown }).start)
        const en = toNum((a as { end?: unknown }).end)
        const win = within(s, (p) => p.x, st, en)
        const set = win.length ? win : s
        const mn = minBy(set, (p) => p.y)
        const mx = maxBy(set, (p) => p.y)
        const scope = st !== null || en !== null ? `${st ?? first.x}–${en ?? last.x}` : `${first.x}–${last.x}`
        const recordNote = mx.x === peak.x && peak.x === last.x ? ' — a record, set in the latest year of data' : ''
        const speech =
          `Over ${scope}, global fossil CO₂ ranged from ${fmtInt(mn.y)} Mt in ${mn.x} to ` +
          `${fmtInt(mx.y)} Mt in ${mx.x}${recordNote} (${SRC.emitters}). ` +
          'Ask compare_emitters for the country ranking, or query_range for a change.'
        return {
          speech,
          data: { ok: true, min: { year: mn.x, value: mn.y }, max: { year: mx.x, value: mx.y }, unit: 'Mt CO₂' },
          mirror: hlPoint('co2-emitters', mx.x, `${fmtInt(mx.y)} Mt`, `peak · ${mx.x}`),
        }
      },
    },
    {
      name: describeTrendToolName('co2-emitters'),
      description:
        'Narrate the global CO₂ emissions curve — the industrial rise, the acceleration, ' +
        'and the still-standing record. Ask compare_emitters for who emits it, or ' +
        'query_range for any window.',
      inputSchema: { type: 'object', properties: {} },
      argsSummary: () => 'co2-emitters_describe_trend()',
      execute: () => {
        const y1950 = minBy(s, (p) => Math.abs(p.x - 1950))
        const speech =
          `Global fossil CO₂ rose from ${fmtInt(first.y)} Mt in ${first.x} to ${fmtInt(y1950.y)} Mt by ${y1950.x} ` +
          `and then took off — ${fmtInt(last.y)} Mt in ${last.x}, a record and still rising (${SRC.emitters}). ` +
          `${ranked[0].country} alone now emits ${fmtInt(ranked[0].value)} Mt. ` +
          'Ask compare_emitters for the full ranking, or find_extremes for the peak.'
        return {
          speech,
          data: { id: 'co2-emitters', headline: getChart('co2-emitters')?.headline() },
          mirror: hlRange('co2-emitters', first.x, last.x, `${fmtInt(last.y)} Mt by ${last.x}`),
        }
      },
    },
    {
      name: 'co2-emitters_compare_emitters',
      description:
        `Rank the six biggest emitting economies by latest-year fossil CO₂ (${SRC.emitters}) ` +
        'and say how far ahead the leader is. Emphasises the top bar. Ask describe_trend ' +
        'for the global time story.',
      inputSchema: { type: 'object', properties: {} },
      argsSummary: () => 'co2-emitters_compare_emitters()',
      execute: () => {
        const top = ranked[0]
        const second = ranked[1]
        const third = ranked[2]
        const list = ranked.map((e2) => `${e2.country} ${fmtInt(e2.value)}`).join(', ')
        const vsNextTwo = top.value > second.value + third.value ? ' — more than the next two combined' : ''
        const speech =
          `${top.country} emits the most: ${fmtInt(top.value)} Mt of CO₂ in ${top.year}${vsNextTwo}. ` +
          `The ranking (Mt): ${list} (${SRC.emitters}). ` +
          'Ask describe_trend for how the global total got here.'
        return {
          speech,
          data: { ok: true, year: top.year, ranking: ranked.map((e2) => ({ country: e2.country, value: e2.value })), unit: 'Mt CO₂' },
          mirror: barEmphasis('co2-emitters', top.country, `${fmtInt(top.value)} Mt`, `top emitter · ${top.year}`),
        }
      },
    },
    sonifyTool('co2-emitters', {
      values: s.map((p) => p.y),
      period: `${first.x}–${last.x}`,
      peakWithUnit: `${fmtInt(peak.y)} Mt`,
      peakLabel: String(peak.x),
    }),
  ]
}

// --- wealth-carbon (scatter) -------------------------------------------------

function wealthFamily(): ToolDef[] {
  const pts = wealthCarbon.points
  const r = pearson(pts.map((p) => p.x), pts.map((p) => p.y))
  const topCo2 = maxBy(pts, (p) => p.y)
  const lowCo2 = minBy(pts, (p) => p.y)
  const topGdp = maxBy(pts, (p) => p.x)

  return [
    {
      name: 'wealth-carbon_describe_relationship',
      description:
        'Compute and explain the wealth→carbon relationship: the Pearson correlation ' +
        `between GDP per capita and CO₂ per capita across ${pts.length} countries, with the ` +
        'countries that break the pattern. Ask query_nearest for a specific country.',
      inputSchema: { type: 'object', properties: {} },
      argsSummary: () => 'wealth-carbon_describe_relationship()',
      execute: () => {
        const speech =
          `Across ${pts.length} countries in ${wealthCarbon.year}, wealth and carbon are strongly linked: ` +
          `Pearson r≈${round(r, 2)} between GDP per capita and CO₂ per capita. The spread runs ` +
          `${round(lowCo2.y, 2)} t/person (${lowCo2.country}) to ${round(topCo2.y, 1)} t (${topCo2.country}) — ` +
          `yet ${topGdp.country}, the richest at $${fmtInt(topGdp.x)}, emits ${round(topGdp.y, 1)} t, so income is ` +
          `not destiny (${SRC.wealth}). Ask query_nearest for any single country.`
        return {
          speech,
          data: { ok: true, r: Number(round(r, 2)), year: wealthCarbon.year, countries: pts.length },
          mirror: scatterRing('wealth-carbon', topCo2.country, `r≈${round(r, 2)}`, `${topCo2.country}: $${fmtInt(topCo2.x)} → ${round(topCo2.y, 1)} t/person`),
        }
      },
    },
    {
      name: 'wealth-carbon_query_nearest',
      description:
        'Return the GDP-per-capita / CO₂-per-capita point for a country (by name), or ' +
        'the nearest country to a given GDP (x, $) or emissions (y, t/person). Rings ' +
        'that dot. Ask describe_relationship for the overall correlation.',
      inputSchema: {
        type: 'object',
        properties: {
          country: { type: 'string', description: 'Country name, e.g. "India".' },
          x: { type: 'number', description: 'Optional: GDP per capita ($) to match instead.' },
          y: { type: 'number', description: 'Optional: t CO₂ per capita to match instead.' },
        },
      },
      argsSummary: (a) => {
        const c = String((a as { country?: unknown }).country ?? '').trim()
        const x = toNum((a as { x?: unknown }).x)
        const yy = toNum((a as { y?: unknown }).y)
        if (c) return `wealth-carbon_query_nearest(${c})`
        if (x !== null) return `wealth-carbon_query_nearest(x:${x})`
        if (yy !== null) return `wealth-carbon_query_nearest(y:${yy})`
        return 'wealth-carbon_query_nearest(top)'
      },
      execute: (a) => {
        const c = String((a as { country?: unknown }).country ?? '').trim().toLowerCase()
        const x = toNum((a as { x?: unknown }).x)
        const yy = toNum((a as { y?: unknown }).y)
        let pt = topCo2
        let how = 'highest per-capita emitter'
        if (c) {
          const found = pts.find((p) => p.country.toLowerCase().includes(c) || p.code.toLowerCase() === c)
          if (!found) {
            return {
              speech:
                `No "${c}" among the ${pts.length} plotted countries. ` +
                'Ask describe_relationship for the overall picture, or name another country.',
              data: { ok: false, countries: pts.map((p) => p.country) },
            }
          }
          pt = found
          how = 'matched by name'
        } else if (x !== null) {
          pt = minBy(pts, (p) => Math.abs(p.x - x))
          how = `nearest GDP to $${fmtInt(x)}`
        } else if (yy !== null) {
          pt = minBy(pts, (p) => Math.abs(p.y - yy))
          how = `nearest emissions to ${round(yy, 1)} t/person`
        }
        const speech =
          `${pt.country} (${how}): GDP per capita $${fmtInt(pt.x)}, emitting ${round(pt.y, 2)} tonnes of CO₂ ` +
          `per person in ${wealthCarbon.year} (${SRC.wealth}). Ask describe_relationship for the overall correlation.`
        return {
          speech,
          data: { ok: true, country: pt.country, gdp_per_capita: pt.x, co2_per_capita: pt.y, year: wealthCarbon.year },
          mirror: scatterRing('wealth-carbon', pt.country, `${round(pt.y, 2)} t/person`, `$${fmtInt(pt.x)} GDP/capita · ${pt.country}`),
        }
      },
    },
  ]
}

// --- co2-live (live) ---------------------------------------------------------

function liveFamily(): ToolDef[] {
  // Read the SESSION-LOCAL live state at build time. `refreshLiveSurface()` (in
  // workspace.ts) rebuilds this family on every tick while commissioned, so
  // `current_value`'s DESCRIPTION carries the latest ppm and getTools() visibly
  // changes over the session.
  const ppm = getCurrentRate()
  const liveValues = getLiveValues()
  const livePeak = liveValues.reduce((m, v) => (v > m ? v : m), liveValues[0])

  return [
    {
      name: 'co2-live_current_value',
      description:
        `Get the live CO₂ concentration at Mauna Loa — last tick ${round(ppm, 2)} ppm ` +
        '(simulated feed seeded from the real latest weekly mean, re-registered every tick). ' +
        "Ask session_stats for this session's range.",
      inputSchema: { type: 'object', properties: {} },
      argsSummary: () => 'co2-live_current_value()',
      execute: () => {
        const s = getSessionStats()
        const speech =
          `CO₂ is at ${round(s.current, 2)} ppm right now (${SRC.live}) — versus roughly 280 ppm before ` +
          `the industrial era. This session has ticked ${s.tickCount} time${s.tickCount === 1 ? '' : 's'} from the ` +
          `real seed ${round(s.seed, 2)}. This tool re-registers each tick, so its listing in getTools() changes ` +
          'over time. Ask session_stats for the range.'
        return {
          speech,
          data: { ok: true, value: s.current, ticks: s.tickCount, seed: s.seed, unit: 'ppm', simulated: co2Live.live_simulated },
          mirror: hlPoint('co2-live', 0, `${round(s.current, 2)} ppm`, `live · tick ${s.tickCount}`),
        }
      },
    },
    {
      name: 'co2-live_session_stats',
      description:
        "Summarise THIS browsing session's CO₂ feed: ticks seen, min, max and range in ppm — " +
        'state that exists only in your session and is in no dataset. Ask current_value for the latest tick.',
      inputSchema: { type: 'object', properties: {} },
      argsSummary: () => 'co2-live_session_stats()',
      execute: () => {
        const s = getSessionStats()
        const secs = Math.round(s.elapsedMs / 1000)
        const seen =
          s.tickCount === 0
            ? 'No ticks yet this session'
            : `This session has seen ${s.tickCount} tick${s.tickCount === 1 ? '' : 's'} over ~${secs}s`
        const speech =
          `${seen}. The feed ranged ${round(s.min, 2)}–${round(s.max, 2)} ppm ` +
          `(range ${round(s.range, 3)}), now ${round(s.current, 2)}, walking from the real seed ${round(s.seed, 2)} (${SRC.live}). ` +
          'These values exist only in your browser session — no offline model or dataset has them. Ask current_value for the latest tick.'
        return {
          speech,
          data: { ok: true, ticks: s.tickCount, min: s.min, max: s.max, range: Number(round(s.range, 3)), current: s.current, seed: s.seed, elapsedMs: s.elapsedMs, unit: 'ppm' },
          mirror: hlPoint('co2-live', 0, `${round(s.min, 2)}–${round(s.max, 2)} ppm`, `${s.tickCount} ticks · range ${round(s.range, 3)}`),
        }
      },
    },
    sonifyTool('co2-live', {
      values: liveValues,
      period: `${liveValues.length} weekly means`,
      peakWithUnit: `${round(livePeak, 2)} ppm`,
      peakLabel: 'the live feed',
      // Read the session-accumulated buffer at play time so a grown feed is heard.
      dynamic: () => {
        const v = getLiveValues()
        const pk = v.reduce((m, x2) => (x2 > m ? x2 : m), v[0])
        return {
          values: v,
          period: `${v.length} readings incl. this session's ticks`,
          peakWithUnit: `${round(pk, 2)} ppm`,
          peakLabel: 'the live feed',
        }
      },
    }),
  ]
}

// --- Family assembly --------------------------------------------------------

const FAMILIES: Record<string, () => ToolDef[]> = {
  'temp-anomaly': tempFamily,
  'co2-emitters': emittersFamily,
  'wealth-carbon': wealthFamily,
  'co2-live': liveFamily,
}

/** The focus-scoped surface definition for one chart. */
export function surfaceFor(chart: ChartMeta): SurfaceDef {
  const build = FAMILIES[chart.id]
  return {
    describe: `${chart.title} — ${chart.unit}, ${chart.period}.`,
    tools: build ? build() : [],
  }
}

/**
 * Build a chart's surface def by id (fresh each call — the co2-live family
 * reads session state at build time). Registration happens ONLY through the
 * workspace's `commissionView` / `create_view`, never at boot.
 */
export function buildSurface(chartId: string): SurfaceDef | undefined {
  const chart = getChart(chartId)
  return chart ? surfaceFor(chart) : undefined
}

/** Registered tool names a chart's family exposes while focused (order preserved). */
export function toolNamesFor(chartId: string): string[] {
  return buildSurface(chartId)?.tools.map((t) => t.name) ?? []
}

/** How many tools a chart's family exposes while focused. */
export function toolCountFor(chartId: string): number {
  return buildSurface(chartId)?.tools.length ?? 0
}

// Kept for callers that only need the registry side effect at focus time.
export { registry }

// Re-export for convenience so integration code has one import site.
export { getChart }
