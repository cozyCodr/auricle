/**
 * orientation.ts — Auricle's five always-on global tools.
 *
 * `describe_screen`, `list_visualizations`, `create_view`, `clear_workspace`,
 * and `focus_chart` form the agent's entry point. The app boots as a RAW DATA
 * SHELF — four dense real-data tables, zero charts, zero chart tools. A chart
 * (and its scoped tool family) exists only after `create_view` commissions it;
 * `clear_workspace` tears everything back down to the shelf. `describe_screen`
 * and `list_visualizations` narrate whichever state the workspace is in, always
 * with real headline figures, and steer the agent's next call.
 *
 * `registerOrientationTools()` is idempotent (the registry de-dupes globals),
 * so it is safe to call once at app start. NO chart surfaces are registered at
 * boot — they are born inside `commissionView` (see workspace.ts).
 */

import { registry, type ToolDef } from '../lib/agent-a11y'
import { CHARTS, CHART_IDS, getChart, type ChartKind } from './charts.ts'
import { toolCountFor, toolNamesFor } from './surfaces.ts'
import { setFocus } from './focus.ts'
import {
  commissionView,
  clearWorkspace,
  getWorkspace,
  getWorkspaceIds,
  isCommissioned,
} from './workspace.ts'
import { rowCountFor, TOTAL_ROWS } from '../charts/data.ts'

const EMPTY_OBJECT_SCHEMA = { type: 'object', properties: {} } as const

const WHAT_IS_AURICLE =
  'Auricle is a dashboard you can interview: four real climate datasets ' +
  '(NASA, OWID, NOAA) that you query in plain language through WebMCP tools. ' +
  'It starts as raw tables — every chart exists only because someone asked for it.'

const VALID_KINDS: readonly ChartKind[] = ['line', 'bar', 'scatter', 'live']

/** Human name for a dataset used in commissioning speech. */
const VIEW_NICKNAME: Record<string, string> = {
  'temp-anomaly': 'the warming curve',
  'co2-emitters': 'the emissions chart',
  'wealth-carbon': 'the wealth-vs-carbon scatter',
  'co2-live': 'the live CO₂ feed',
}

/** "temp-anomaly" (or none) → readable focus clause. */
function focusClause(): string {
  const focused = registry.focused
  if (!focused) return 'No view is focused.'
  const chart = getChart(focused)
  return `Focused view: ${chart ? chart.title : focused}.`
}

/** One-line shelf description of a dataset (id, source, real row count). */
function shelfLine(id: string): string {
  const c = getChart(id)!
  return `• ${id} — ${c.title}, ${rowCountFor(id)} rows (${c.source}).`
}

const describeScreen: ToolDef = {
  name: 'describe_screen',
  description:
    'Start here. Describes what is on screen right now: on first load, the raw ' +
    'data shelf (four real climate tables, no charts) and how to commission a ' +
    'view; once views exist, each live view with its real headline figure. ' +
    'Steers your next call (create_view on the shelf; a view’s tools after).',
  inputSchema: EMPTY_OBJECT_SCHEMA,
  execute: () => {
    const ws = getWorkspace()
    if (ws.length === 0) {
      const speech = [
        WHAT_IS_AURICLE,
        `The screen shows the raw shelf: ${TOTAL_ROWS.toLocaleString('en-US')} rows across four tables. Zero answers.`,
        ...CHART_IDS.map(shelfLine),
        'No views yet. Ask create_view with a dataset id (e.g. create_view {"dataset":"temp-anomaly"}) and its chart plus its tool family will come online.',
      ].join(' ')
      return {
        speech,
        data: {
          app: 'Auricle',
          state: 'shelf',
          total_rows: TOTAL_ROWS,
          datasets: CHARTS.map((c) => ({ id: c.id, title: c.title, rows: rowCountFor(c.id), source: c.source, kind: c.kind })),
        },
        mirror: { kind: 'describe-screen' },
      }
    }
    const lines = ws.map((v) => {
      const c = getChart(v.chartId)!
      return `• ${c.title} (${v.kind}): ${c.headline()}`
    })
    const remaining = CHART_IDS.filter((id) => !isCommissioned(id))
    const remainingNote = remaining.length
      ? ` Still on the shelf, uncommissioned: ${remaining.join(', ')} — create_view brings any of them up.`
      : ' Every dataset has been commissioned.'
    const speech = [
      WHAT_IS_AURICLE,
      `${ws.length} live view${ws.length === 1 ? '' : 's'}:`,
      ...lines,
      focusClause(),
      `Call focus_chart to move between views, or ask the focused view’s tools.${remainingNote}`,
    ].join(' ')
    return {
      speech,
      data: {
        app: 'Auricle',
        state: 'workspace',
        focused: registry.focused,
        views: ws.map((v) => ({
          id: v.chartId,
          kind: v.kind,
          title: getChart(v.chartId)?.title,
          headline: getChart(v.chartId)?.headline(),
        })),
        uncommissioned: remaining,
      },
      mirror: { kind: 'describe-screen' },
    }
  },
}

const listVisualizations: ToolDef = {
  name: 'list_visualizations',
  description:
    'Lists the commissioned views (id, title, kind, focused or not, tool count) ' +
    'and the datasets still waiting on the shelf. Use it to pick an id, then ' +
    'create_view (shelf) or focus_chart (live view).',
  inputSchema: EMPTY_OBJECT_SCHEMA,
  execute: () => {
    const ids = getWorkspaceIds()
    const rows = CHARTS.map((c) => {
      const commissioned = ids.includes(c.id)
      return {
        id: c.id,
        title: c.title,
        kind: c.kind,
        rows: rowCountFor(c.id),
        commissioned,
        focused: registry.focused === c.id,
        tools: commissioned ? toolCountFor(c.id) : 0,
      }
    })
    const live = rows.filter((r) => r.commissioned)
    const shelf = rows.filter((r) => !r.commissioned)
    const liveText = live.length
      ? live
          .map(
            (r) =>
              `${r.id} · ${r.title} · ${r.kind} · ${r.focused ? 'focused' : 'not focused'} · ${r.tools} tool${r.tools === 1 ? '' : 's'}`,
          )
          .join('  |  ')
      : 'No views yet — the workspace is empty.'
    const shelfText = shelf.length
      ? `On the shelf: ${shelf.map((r) => `${r.id} (${r.rows} rows, would render as ${r.kind})`).join(', ')}. Ask create_view to commission one.`
      : 'Nothing left on the shelf.'
    return { speech: `${liveText}  ${shelfText}`, data: rows, mirror: { kind: 'list-visualizations' } }
  },
}

const createView: ToolDef = {
  name: 'create_view',
  description:
    'Commission a view from a dataset: the chart appears in the workspace and its ' +
    'tool family registers at that moment (it did not exist before). Idempotent — ' +
    'recommissioning an existing view just refocuses it. Datasets: ' +
    `${CHART_IDS.join(', ')}. Kind defaults to the dataset’s canonical form.`,
  inputSchema: {
    type: 'object',
    properties: {
      dataset: {
        type: 'string',
        enum: CHART_IDS,
        description: 'The dataset to commission, e.g. "temp-anomaly".',
      },
      kind: {
        type: 'string',
        enum: VALID_KINDS,
        description: 'Optional chart kind; defaults to the dataset’s canonical kind.',
      },
    },
    required: ['dataset'],
  },
  argsSummary: (args) => {
    const d = String((args as { dataset?: string }).dataset ?? '?')
    const k = (args as { kind?: string }).kind
    return `create_view(${d}${k ? `, ${k}` : ''})`
  },
  execute: (args) => {
    const dataset = String((args as { dataset?: string }).dataset ?? '')
    const rawKind = (args as { kind?: string }).kind
    const chart = getChart(dataset)
    if (!chart) {
      return {
        speech:
          `No dataset with id "${dataset}". Valid ids: ${CHART_IDS.join(', ')}. ` +
          'Call list_visualizations to see the shelf.',
        data: { ok: false, validIds: CHART_IDS },
      }
    }
    const kind =
      rawKind && (VALID_KINDS as readonly string[]).includes(rawKind) ? (rawKind as ChartKind) : undefined
    const result = commissionView(dataset, kind)
    if (!result) {
      return { speech: `Could not commission "${dataset}".`, data: { ok: false } }
    }
    const names = toolNamesFor(dataset)
    const rows = rowCountFor(dataset)
    const nickname = VIEW_NICKNAME[dataset] ?? chart.title
    if (!result.created) {
      const speech =
        `${chart.title} is already in the workspace — refocused it. ` +
        `Its ${names.length} tools are live: ${names.join(', ')}. ${chart.headline()}`
      return {
        speech,
        data: { ok: true, created: false, view: result.view, tools: names },
        mirror: { kind: 'focus-ring', chartId: dataset },
      }
    }
    const speech =
      `Built you ${nickname} — ${rows.toLocaleString('en-US')} rows of it. ` +
      `Its ${names.length} tools just came online: ${names.join(', ')}. ` +
      `${chart.headline()} It is focused and ready to interview.`
    return {
      speech,
      data: { ok: true, created: true, view: result.view, tools: names, headline: chart.headline() },
      mirror: { kind: 'view-created', chartId: dataset, viewKind: result.view.kind },
    }
  },
}

const clearWorkspaceTool: ToolDef = {
  name: 'clear_workspace',
  description:
    'Tear every commissioned view down: unregisters all chart tool families, ' +
    'clears focus, and returns the screen to the raw data shelf. The globals ' +
    '(this tool included) stay. Ask create_view to start again.',
  inputSchema: EMPTY_OBJECT_SCHEMA,
  execute: () => {
    const had = getWorkspaceIds()
    clearWorkspace()
    const speech = had.length
      ? `Cleared ${had.length} view${had.length === 1 ? '' : 's'} (${had.join(', ')}) — their tool families are ` +
        `unregistered and the screen is back to the raw shelf: ${TOTAL_ROWS.toLocaleString('en-US')} rows, zero answers. ` +
        'Ask create_view to commission a fresh view.'
      : 'The workspace was already empty — you are looking at the raw shelf. Ask create_view to commission a view.'
    return {
      speech,
      data: { ok: true, cleared: had },
      mirror: { kind: 'workspace-cleared' },
    }
  },
}

const focusChart: ToolDef = {
  name: 'focus_chart',
  description:
    'Moves focus to one COMMISSIONED view so its tools become available (and ' +
    'every other view’s tools are unregistered). Views must be commissioned ' +
    'with create_view first. Pass an id from list_visualizations.',
  inputSchema: {
    type: 'object',
    properties: {
      chart_id: {
        type: 'string',
        enum: CHART_IDS,
        description: 'The commissioned view to focus, e.g. "temp-anomaly".',
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
          `No dataset with id "${chartId}". Valid ids: ${CHART_IDS.join(', ')}. ` +
          'Call list_visualizations to see them.',
        data: { ok: false, validIds: CHART_IDS },
      }
    }
    if (!isCommissioned(chartId)) {
      return {
        speech:
          `${chart.title} has not been commissioned — it is still raw rows on the shelf. ` +
          `Call create_view {"dataset":"${chartId}"} and its chart plus tools will come online.`,
        data: { ok: false, commissioned: getWorkspaceIds() },
      }
    }
    // Route through the reactive focus controller (not registry.focus directly)
    // so agent-driven focus also updates the UI. setFocus calls registry.focus
    // under the hood, so the tool family still swaps.
    setFocus(chartId)
    const names = toolNamesFor(chartId)
    const speech =
      `Focused ${chart.title}. ${names.length} tool${names.length === 1 ? '' : 's'} ` +
      `now registered: ${names.join(', ')}. Other views’ tools unregistered.`
    return {
      speech,
      data: { ok: true, focused: chartId, tools: names },
      mirror: { kind: 'focus-ring', chartId },
    }
  },
}

/**
 * Register the five global tools on the app-wide registry.
 * Idempotent; safe to call once at startup (and a no-op without WebMCP).
 */
export function registerOrientationTools(): void {
  registry.registerGlobal(describeScreen)
  registry.registerGlobal(listVisualizations)
  registry.registerGlobal(createView)
  registry.registerGlobal(clearWorkspaceTool)
  registry.registerGlobal(focusChart)
}
