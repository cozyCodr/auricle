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
import {
  CHARTS,
  CHART_IDS,
  getChart,
  ALL_KINDS,
  KIND_WHITELIST,
  KIND_SPEECH,
  type ChartKind,
} from './charts.ts'
import { toolCountFor, toolNamesFor } from './surfaces.ts'
import { setFocus } from './focus.ts'
import {
  commissionView,
  clearWorkspace,
  getWorkspace,
  getWorkspaceIds,
  isCommissioned,
  kindsFor,
} from './workspace.ts'
import { rowCountFor, TOTAL_ROWS } from '../charts/data.ts'

const EMPTY_OBJECT_SCHEMA = { type: 'object', properties: {} } as const

const WHAT_IS_AURICLE =
  'You’re on Auricle, a climate-data publication your user is reading: four real ' +
  'datasets (NASA, OWID, NOAA) presented as deep tables. To you it is a workbench — ' +
  'I can compute statistics from the page’s own data, draw new chart views onto the ' +
  'canvas, highlight answers on the charts, and play any series as sound.'

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

/** One-line publication description of a dataset (id, source, real row count). */
function shelfLine(id: string): string {
  const c = getChart(id)!
  return `• ${id} — ${c.title}, ${rowCountFor(id).toLocaleString('en-US')} rows (${c.source}).`
}

const describeScreen: ToolDef = {
  name: 'describe_screen',
  description:
    'Start here. Auricle is a climate-data publication your user is reading. ' +
    'Calling this tells you what’s on screen and everything you can do for them: ' +
    'compute statistics from the page’s own data, draw new chart views onto the ' +
    'canvas (9 kinds), highlight answers visually, and play any series as sound. ' +
    'It also steers your next call (create_view first; a view’s tools after).',
  inputSchema: EMPTY_OBJECT_SCHEMA,
  execute: () => {
    const ws = getWorkspace()
    if (ws.length === 0) {
      const speech = [
        WHAT_IS_AURICLE,
        `The page shows the publication: ${TOTAL_ROWS.toLocaleString('en-US')} rows across four tables. Zero answers.`,
        ...CHART_IDS.map(shelfLine),
        'No views yet. Ask create_view with a dataset id (e.g. create_view {"dataset":"temp-anomaly"}) and its chart plus its tool family will come online.',
      ].join(' ')
      return {
        speech,
        data: {
          app: 'Auricle',
          state: 'publication',
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
      ? ` Still uncommissioned: ${remaining.join(', ')} — create_view draws any of them onto the canvas.`
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
    'Lists the views you have drawn for your user (id, title, kind, focused or ' +
    'not, tool count) and the datasets still uncommissioned in the publication. ' +
    'Use it to pick an id, then create_view (uncommissioned) or focus_chart ' +
    '(live view).',
  inputSchema: EMPTY_OBJECT_SCHEMA,
  execute: () => {
    const ids = getWorkspaceIds()
    const rows = CHARTS.map((c) => {
      const commissioned = ids.includes(c.id)
      return {
        id: c.id,
        title: c.title,
        kind: c.kind,
        kinds: kindsFor(c.id),
        valid_kinds: KIND_WHITELIST[c.id] ?? [],
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
              `${r.id} · ${r.title} · ${r.kinds.join(' + ')} · ${r.focused ? 'focused' : 'not focused'} · ${r.tools} tool${r.tools === 1 ? '' : 's'}`,
          )
          .join('  |  ')
      : 'No views yet — the workspace is empty.'
    const shelfText = shelf.length
      ? `Still uncommissioned: ${shelf.map((r) => `${r.id} (${r.rows.toLocaleString('en-US')} rows, would render as ${r.kind})`).join(', ')}. Ask create_view to draw one onto the canvas.`
      : 'Every dataset is on the canvas.'
    return { speech: `${liveText}  ${shelfText}`, data: rows, mirror: { kind: 'list-visualizations' } }
  },
}

/** "temp-anomaly [line, area, stripes, stat]" lines for the tool description. */
const KIND_MENU = CHART_IDS.map((id) => `${id} [${(KIND_WHITELIST[id] ?? []).join(', ')}]`).join(' · ')

const createView: ToolDef = {
  name: 'create_view',
  description:
    'Draw a new view onto the canvas for your user: the chart materializes on the ' +
    'page (9 kinds across the datasets) and its tool family registers at that ' +
    'moment — each view you create brings its own tools online, so your action ' +
    'space grows. The SAME dataset can be drawn as multiple kinds at once (e.g. ' +
    'temp-anomaly as a line AND as stripes) — idempotent per (dataset, kind) pair; ' +
    `re-asking an existing pair just refocuses it. Kinds per dataset: ${KIND_MENU}. ` +
    'Kind defaults to the dataset’s canonical form.',
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
        enum: ALL_KINDS,
        description:
          'Optional chart kind; defaults to the dataset’s canonical kind. ' +
          `Valid pairs: ${KIND_MENU}.`,
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
    const allowed = KIND_WHITELIST[dataset] ?? []
    if (rawKind !== undefined && !(allowed as readonly string[]).includes(rawKind)) {
      // Helpful, non-throwing: name the dataset's real kinds and how to ask.
      return {
        speech:
          `${chart.title} doesn't render as "${rawKind}". Its kinds: ${allowed.join(', ')}. ` +
          `Try create_view {"dataset":"${dataset}","kind":"${allowed[1] ?? allowed[0]}"} — ` +
          `or omit kind for the canonical ${chart.kind}.`,
        data: { ok: false, dataset, validKinds: allowed },
      }
    }
    const result = commissionView(dataset, rawKind as ChartKind | undefined)
    if (!result) {
      return { speech: `Could not commission "${dataset}".`, data: { ok: false } }
    }
    const kind = result.view.kind
    const names = toolNamesFor(dataset)
    const rows = rowCountFor(dataset)
    const nickname = VIEW_NICKNAME[dataset] ?? chart.title
    if (!result.created) {
      const speech =
        `${chart.title} is already in the workspace as ${KIND_SPEECH[kind]} — refocused it. ` +
        `Its ${names.length} tools are live: ${names.join(', ')}. ${chart.headline()}`
      return {
        speech,
        data: { ok: true, created: false, view: result.view, tools: names },
        mirror: { kind: 'focus-ring', chartId: dataset },
      }
    }
    if (!result.familyBorn) {
      // A NEW kind of an already-commissioned dataset — the living-dashboard
      // re-render. Same rows, new shape; the family was already registered.
      const speech =
        `Rebuilt ${nickname} as ${KIND_SPEECH[kind]} — same ${rows.toLocaleString('en-US')} rows, ` +
        `new shape, side by side with its other view${kindsFor(dataset).length > 2 ? 's' : ''}. ` +
        `Its tools are already live. ${chart.headline()}`
      return {
        speech,
        data: { ok: true, created: true, view: result.view, tools: names, kinds: kindsFor(dataset) },
        mirror: { kind: 'view-created', chartId: dataset, viewKind: kind },
      }
    }
    const speech =
      `Built you ${nickname} as ${KIND_SPEECH[kind]} — ${rows.toLocaleString('en-US')} rows of it. ` +
      `Its ${names.length} tools just came online: ${names.join(', ')}. ` +
      `${chart.headline()} It is focused and ready to interview.`
    return {
      speech,
      data: { ok: true, created: true, view: result.view, tools: names, headline: chart.headline() },
      mirror: { kind: 'view-created', chartId: dataset, viewKind: kind },
    }
  },
}

const clearWorkspaceTool: ToolDef = {
  name: 'clear_workspace',
  description:
    'Tear every commissioned view down for your user: unregisters all chart tool ' +
    'families, clears focus, and returns the page to the publication — the four ' +
    'deep dataset tables. The globals (this tool included) stay. Ask create_view ' +
    'to start again.',
  inputSchema: EMPTY_OBJECT_SCHEMA,
  execute: () => {
    const had = getWorkspaceIds()
    clearWorkspace()
    const speech = had.length
      ? `Cleared ${had.length} view${had.length === 1 ? '' : 's'} (${had.join(', ')}) — their tool families are ` +
        `unregistered and the page is back to the publication: ${TOTAL_ROWS.toLocaleString('en-US')} rows, zero answers. ` +
        'Ask create_view to commission a fresh view.'
      : 'The workspace was already empty — the page shows the publication. Ask create_view to commission a view.'
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
          `${chart.title} has not been commissioned — it is still deep rows in the publication. ` +
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
