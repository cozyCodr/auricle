/**
 * orientation.ts — Auricle's three always-on global tools.
 *
 * `describe_screen`, `list_visualizations`, and `focus_chart` form the agent's
 * entry point: they orient it, enumerate the charts with real headline figures,
 * and move the single focus so a chart's scoped tool family appears. Every
 * description is task-level and steers the agent's next call.
 *
 * `registerOrientationTools()` is idempotent (the registry de-dupes globals),
 * so it is safe to call once at app start. Registering the four chart surfaces
 * is a separate step (see `registerDashboard` in ./index.ts) because `focus`
 * only swaps families for surfaces that already exist.
 */

import { registry, type ToolDef } from '../lib/agent-a11y'
import { CHARTS, CHART_IDS, getChart } from './charts.ts'
import { toolCountFor, toolNamesFor } from './surfaces.ts'
import { setFocus } from './focus.ts'

const EMPTY_OBJECT_SCHEMA = { type: 'object', properties: {} } as const

const WHAT_IS_AURICLE =
  'Auricle is a dashboard you can interview: four Zambian open-data charts you ' +
  'query in plain language through WebMCP tools.'

/** "maize-prices" (or "none") → readable focus clause. */
function focusClause(): string {
  const focused = registry.focused
  if (!focused) return 'No chart is focused yet.'
  const chart = getChart(focused)
  return `Focused chart: ${chart ? chart.title : focused}.`
}

const describeScreen: ToolDef = {
  name: 'describe_screen',
  description:
    'Start here. Describes Auricle and every chart’s headline figure, says which ' +
    'chart is focused, and tells you what to focus next. Then call focus_chart ' +
    'with a chart id before querying that chart.',
  inputSchema: EMPTY_OBJECT_SCHEMA,
  execute: () => {
    const lines = CHARTS.map((c) => `• ${c.title}: ${c.headline()}`)
    const speech = [
      WHAT_IS_AURICLE,
      ...lines,
      focusClause(),
      'Call focus_chart with a chart id, then ask that chart’s tools.',
    ].join(' ')
    return {
      speech,
      data: {
        app: 'Auricle',
        focused: registry.focused,
        charts: CHARTS.map((c) => ({
          id: c.id,
          title: c.title,
          unit: c.unit,
          period: c.period,
          headline: c.headline(),
        })),
      },
      mirror: { kind: 'describe-screen' },
    }
  },
}

const listVisualizations: ToolDef = {
  name: 'list_visualizations',
  description:
    'Lists the four charts with id, title, unit, period, whether each is focused, ' +
    'and how many tools it exposes when focused. Use it to pick a chart id, then ' +
    'call focus_chart.',
  inputSchema: EMPTY_OBJECT_SCHEMA,
  execute: () => {
    const rows = CHARTS.map((c) => {
      const focused = registry.focused === c.id
      const tools = toolCountFor(c.id)
      return {
        id: c.id,
        title: c.title,
        unit: c.unit,
        period: c.period,
        focused,
        tools,
      }
    })
    const speech = rows
      .map(
        (r) =>
          `${r.id} · ${r.title} · ${r.unit} · ${r.period} · ` +
          `${r.focused ? 'focused' : 'not focused'} · ${r.tools} tool${r.tools === 1 ? '' : 's'}`,
      )
      .join('  |  ')
    return { speech, data: rows, mirror: { kind: 'list-visualizations' } }
  },
}

const focusChart: ToolDef = {
  name: 'focus_chart',
  description:
    'Moves focus to one chart so its tools become available (and every other ' +
    'chart’s tools are unregistered). Call this before querying a chart. Pass a ' +
    'chart id from list_visualizations.',
  inputSchema: {
    type: 'object',
    properties: {
      chart_id: {
        type: 'string',
        enum: CHART_IDS,
        description: 'The chart to focus, e.g. "maize-prices".',
      },
    },
    required: ['chart_id'],
  },
  argsSummary: (args) => `focus_chart(${String((args as { chart_id?: string }).chart_id ?? '?')})`,
  execute: (args) => {
    const chartId = String((args as { chart_id?: string }).chart_id ?? '')
    const chart = getChart(chartId)
    if (!chart) {
      return {
        speech:
          `No chart with id "${chartId}". Valid ids: ${CHART_IDS.join(', ')}. ` +
          'Call list_visualizations to see them.',
        data: { ok: false, validIds: CHART_IDS },
      }
    }
    // Route through the reactive focus controller (not registry.focus directly)
    // so agent-driven focus also updates the UI. setFocus calls registry.focus
    // under the hood, so the tool family still swaps.
    setFocus(chartId)
    const names = toolNamesFor(chartId)
    const speech =
      `Focused ${chart.title}. ${names.length} tool${names.length === 1 ? '' : 's'} ` +
      `now registered: ${names.join(', ')}. Other charts’ tools unregistered.`
    return {
      speech,
      data: { ok: true, focused: chartId, tools: names },
      mirror: { kind: 'focus-ring', chartId },
    }
  },
}

/**
 * Register the three global orientation tools on the app-wide registry.
 * Idempotent; safe to call once at startup (and a no-op without WebMCP).
 */
export function registerOrientationTools(): void {
  registry.registerGlobal(describeScreen)
  registry.registerGlobal(listVisualizations)
  registry.registerGlobal(focusChart)
}
