/**
 * intents.ts — a DEMO-ONLY intent matcher that simulates an agent locally.
 *
 * ⚠️ HONESTY NOTE FOR THE SUBMISSION: this is NOT natural-language understanding
 * and it is NOT Auricle's primary interaction path. The product's primary path
 * is the browser agent (for example Codex using ChatGPT Site Tools) that reads
 * the registered tools and calls them. This matcher is a tiny, readable table of
 * a FEW REHEARSED regex patterns → WebMCP tool-call plans, so the full
 * voice → tool → mirror → log loop can be rehearsed in WebMCP-enabled Chrome.
 *
 * It drives the SAME registered tools an agent would, via `document.modelContext`
 * (`getTools()` + `executeTool(tool, JSON.stringify(args))`), so the page mirror,
 * the activity log, and the highlight ring all fire IDENTICALLY to an agent call.
 *
 * The workspace arc shapes every plan: a chart's tool family exists only after
 * its view is COMMISSIONED (`create_view`), and only the focused view's family
 * is registered. So chart-targeted intents are planned as
 * `create_view(<dataset>)` when the view doesn't exist yet (create_view also
 * focuses it), `focus_chart(<id>)` when it exists but isn't focused, THEN the
 * query/sonify tool. `planIntent` is a pure function (transcript + workspace/
 * focus context → ordered plan) and is unit-tested browserless in
 * `src/voice.check.mts`.
 */

import { CHART_IDS } from '../dashboard/charts.ts'
import { getFocus, DEFAULT_FOCUS } from '../dashboard/focus.ts'
import { getWorkspaceIds } from '../dashboard/workspace.ts'
import { registry } from '../lib/agent-a11y/registry.ts'

/** One planned tool call: the exact name + args an agent would send. */
export interface ToolCall {
  readonly tool: string
  readonly args: Readonly<Record<string, unknown>>
}

/** The resolved plan for a transcript. `plan` is empty when nothing matched. */
export interface IntentPlan {
  /** A short label for the matched intent, or `'none'`. */
  readonly intent: string
  /** Ordered tool calls to run (commission/focus-then-act where needed). */
  readonly plan: readonly ToolCall[]
}

/** Workspace + focus context the pure planner needs (kept out for testability). */
export interface IntentContext {
  /** The currently focused chart id, or null. */
  readonly focusedId: string | null
  /** Ids of the views already commissioned into the workspace. */
  readonly commissioned: readonly string[]
}

// --- Chart-id helpers (names computed from CHART_IDS, not hardcoded) ---------

const IDS = new Set<string>(CHART_IDS)
const TEMP = 'temp-anomaly'
const EMITTERS = 'co2-emitters'
const WEALTH = 'wealth-carbon'
const LIVE = 'co2-live'

/** Map a spoken word to a chart id (used by the "focus/show …" intent). */
function chartIdFromWords(text: string): string | null {
  if (/\b(warming|temperature|anomal|hottest|warmest)\b/i.test(text)) return TEMP
  if (/\b(emission|emitter|emit|carbon budget)\b/i.test(text)) return EMITTERS
  if (/\b(wealth|gdp|income|rich|scatter|per.?capita)\b/i.test(text)) return WEALTH
  if (/\b(mauna\s?loa|ppm|live|feed)\b/i.test(text)) return LIVE
  return null
}

/** `create_view` call for a dataset id (optionally with an explicit kind). */
function createCall(dataset: string, kind?: string): ToolCall {
  return { tool: 'create_view', args: kind ? { dataset, kind } : { dataset } }
}

/** `focus_chart` call for a chart id. */
function focusCall(chartId: string): ToolCall {
  return { tool: 'focus_chart', args: { chart_id: chartId } }
}

/**
 * Plan the calls for a chart-targeted intent under the workspace arc:
 *  - view not commissioned → `create_view` first (it commissions AND focuses),
 *  - commissioned but unfocused → `focus_chart` first,
 *  - already focused → just the family tool.
 */
function viewThen(chartId: string, familyTool: ToolCall, ctx: IntentContext): ToolCall[] {
  const calls: ToolCall[] = []
  if (!ctx.commissioned.includes(chartId)) calls.push(createCall(chartId))
  else if (ctx.focusedId !== chartId) calls.push(focusCall(chartId))
  calls.push(familyTool)
  return calls
}

// --- The rehearsed intent table ---------------------------------------------
// First match wins. Each `resolve` returns an ordered plan given context.

interface IntentRule {
  readonly intent: string
  readonly test: RegExp
  resolve(transcript: string, ctx: IntentContext): ToolCall[]
}

const RULES: readonly IntentRule[] = [
  // "what's on the screen" / "describe the screen" / "where am i" — unchanged.
  {
    intent: 'describe-screen',
    test: /(what'?s|what is)\s+on\s+(the\s+)?screen|describe\s+(the\s+)?screen|where\s+am\s+i|orient/i,
    resolve: () => [{ tool: 'describe_screen', args: {} }],
  },
  // "start over" / "clear" — tear the workspace back down to the shelf.
  {
    intent: 'clear-workspace',
    test: /start\s+over|start\s+again|clear\b|reset|tear\s+(it\s+)?down|empty\s+the\s+workspace/i,
    resolve: () => [{ tool: 'clear_workspace', args: {} }],
  },
  // --- Graph-variety re-renders (P0-01b): the SAME dataset as a new kind. ---
  // "show it as stripes" / "as stripes" — the warming record, re-rendered.
  {
    intent: 'as-stripes',
    test: /\bas\s+(warming\s+)?stripes\b|\bstripes\b/i,
    resolve: () => [createCall(TEMP, 'stripes')],
  },
  // "as an area chart" — the diverging red/blue area around zero.
  {
    intent: 'as-area',
    test: /\bas\s+an?\s+area(\s+chart)?\b|\barea\s+chart\b/i,
    resolve: () => [createCall(TEMP, 'area')],
  },
  // "rank them" — the emitters as ranked horizontal bars.
  {
    intent: 'rank-emitters',
    test: /\brank\s+(them|the\s+(countries|emitters))\b|\bas\s+ranked\s+bars\b/i,
    resolve: () => [createCall(EMITTERS, 'hbar')],
  },
  // "what share is China" / "share of emissions" — the 100% proportion bar,
  // then the ranking tool so the shares are narrated with real figures.
  {
    intent: 'share-of-emissions',
    test: /what\s+share\s+is|share\s+of\s+(the\s+)?emissions?|\bas\s+shares?\b/i,
    resolve: () => [
      createCall(EMITTERS, 'share'),
      { tool: `${EMITTERS}_compare_emitters`, args: {} },
    ],
  },
  // "just give me the number" — the focused dataset (default: warming) as a
  // big-number stat tile.
  {
    intent: 'just-the-number',
    test: /just\s+(give\s+me\s+)?the\s+number|\bjust\s+the\s+figure\b|\bas\s+a\s+(big\s+)?number\b/i,
    resolve: (_t, ctx) => [
      createCall(ctx.focusedId && IDS.has(ctx.focusedId) ? ctx.focusedId : TEMP, 'stat'),
    ],
  },
  // "what's CO2 right now" / "current co2" — the live view + its current value.
  {
    intent: 'current-co2',
    test: /current\s+co.?[2₂]|co.?[2₂]\s+(right\s+)?now|what'?s\s+co.?[2₂]|co.?[2₂]\s+level|how much co.?[2₂] is in the air/i,
    resolve: (_t, ctx) => viewThen(LIVE, { tool: `${LIVE}_current_value`, args: {} }, ctx),
  },
  // "who emits the most" — the emitters view + its ranking tool.
  {
    intent: 'compare-emitters',
    test: /who\s+emits|emits?\s+the\s+most|biggest\s+emitters?|top\s+emitters?|compare\s+(the\s+)?(countries|emitters)/i,
    resolve: (_t, ctx) =>
      viewThen(EMITTERS, { tool: `${EMITTERS}_compare_emitters`, args: {} }, ctx),
  },
  // "How much did it warm from 1950 [to 2024]?" — the range beat.
  {
    intent: 'warming-range',
    test: /(?:how much|change|rise|rose|warm(?:ed)?|increase).*(?:from|between|since)\s+(?:18|19|20)\d{2}/i,
    resolve: (text, ctx) => {
      const years = Array.from(text.matchAll(/\b((?:18|19|20)\d{2})\b/g), (match) => Number(match[1]))
      if (!years[0]) return []
      const lastYear = 2025
      return viewThen(
        TEMP,
        {
          tool: `${TEMP}_query_range`,
          args: { start: years[0], end: years[1] ?? lastYear },
        },
        ctx,
      )
    },
  },
  // "when was the hottest year" / "peak" / "spike" — temperature extremes.
  {
    intent: 'hottest-year',
    test: /\bhottest|\bwarmest|\bspik|\bpeak|\brecord\s+(year|warm|heat)|\bhighest/i,
    resolve: (_t, ctx) =>
      viewThen(TEMP, { tool: `${TEMP}_find_extremes`, args: {} }, ctx),
  },
  // "show me warming over time" / "build the warming chart" — commission only.
  {
    intent: 'create-warming',
    test: /(show|build|make|create|draw|chart)\b.*\b(warming|temperature)|warming\s+(over\s+time|chart|curve)/i,
    resolve: (_t, ctx) =>
      ctx.commissioned.includes(TEMP) ? [focusCall(TEMP)] : [createCall(TEMP)],
  },
  // "play it/the century as sound" / "sonify" — sonify the focused view; with
  // nothing focused, the century IS the warming curve: commission it, then play.
  {
    intent: 'sonify',
    test: /play\s+(it|that|this|the\s+century)?\s*(as\s+)?sound|sonif|let me hear|hear (it|that|this)|as sound/i,
    resolve: (_t, ctx) => {
      const focused = ctx.focusedId && IDS.has(ctx.focusedId) ? ctx.focusedId : null
      if (focused) return [{ tool: `${focused}_sonify`, args: {} }]
      return viewThen(DEFAULT_FOCUS, { tool: `${DEFAULT_FOCUS}_sonify`, args: {} }, ctx)
    },
  },
  // "focus / show me / switch to the <chart words>" — explicit navigation.
  {
    intent: 'focus-chart',
    test: /\bfocus\b|\bshow me\b|\bswitch to\b|\bgo to\b|\bbring up\b/i,
    resolve: (t, ctx) => {
      const chartId = chartIdFromWords(t)
      if (!chartId) return []
      return ctx.commissioned.includes(chartId) ? [focusCall(chartId)] : [createCall(chartId)]
    },
  },
]

/**
 * Resolve a transcript to an ordered WebMCP tool-call plan. PURE — no browser,
 * no side effects. `ctx` decides whether a `create_view` / `focus_chart` prefix
 * is needed. Unmatched transcripts return `{ intent: 'none', plan: [] }` (the
 * agent would handle those; here we just show the transcript as the question).
 */
export function planIntent(transcript: string, ctx: IntentContext): IntentPlan {
  const text = transcript.trim()
  if (!text) return { intent: 'none', plan: [] }
  for (const rule of RULES) {
    if (!rule.test.test(text)) continue
    const plan = rule.resolve(text, ctx)
    if (plan.length > 0) return { intent: rule.intent, plan }
    // A rule matched its keyword but couldn't resolve a target (e.g. "focus"
    // with no chart word): fall through to try the next rule / none.
  }
  return { intent: 'none', plan: [] }
}

/** The live context an execution reads: current focus + commissioned views. */
function currentContext(): IntentContext {
  return { focusedId: getFocus(), commissioned: getWorkspaceIds() }
}

// --- Execution against document.modelContext (the agent-identical path) -----

/** WebMCP model context, or null when the flag is off. */
function getModelContext(): WebMCP.ModelContext | null {
  if (typeof document === 'undefined') return null
  const mc = (document as Document).modelContext
  return typeof mc === 'object' && mc !== null ? mc : null
}

/** Whether the page itself can run registered tools for the Chrome voice rehearsal. */
export function isIntentExecutionAvailable(): boolean {
  const mc = getModelContext()
  return Boolean(
    mc && typeof mc.getTools === 'function' && typeof mc.executeTool === 'function',
  )
}

/** Result of running an intent: the resolved plan + whether tools actually ran. */
export interface RunResult extends IntentPlan {
  /** True when the plan was executed against a live `document.modelContext`. */
  readonly executed: boolean
  /** Why execution did not complete, when `executed` is false. */
  readonly failure?: 'unmatched' | 'webmcp-unavailable' | 'execute-unsupported' | 'tool-not-found'
}

/**
 * Resolve AND (when WebMCP is present) EXECUTE the plan for `transcript`, exactly
 * as an external agent would: look each tool up in `getTools()` and call
 * `executeTool(tool, JSON.stringify(args))`, awaiting sequentially so a
 * `create_view` / `focus_chart` step registers the chart's family before the
 * next step looks it up. Returns the plan regardless; `executed` is false when
 * `document.modelContext` is absent (voice still displays the transcript).
 */
export async function runIntent(transcript: string): Promise<RunResult> {
  const plan = planIntent(transcript, currentContext())
  const mc = getModelContext()
  if (plan.plan.length === 0) return { ...plan, executed: false, failure: 'unmatched' }
  if (!mc) return { ...plan, executed: false, failure: 'webmcp-unavailable' }
  if (typeof mc.getTools !== 'function' || typeof mc.executeTool !== 'function') {
    return { ...plan, executed: false, failure: 'execute-unsupported' }
  }
  for (const call of plan.plan) {
    // Re-read the tool list each step: after create_view/focus_chart runs, the
    // newly focused chart's family is registered and its tool becomes findable.
    const tools = await mc.getTools()
    const tool = tools.find((t) => t.name === call.tool)
    if (!tool) return { ...plan, executed: false, failure: 'tool-not-found' }
    // The current WebMCP draft accepts an input object, while Chrome's earlier
    // developer API accepts a JSON string. Auricle's tools are read-only, so a
    // rejected object-form call can safely fall back to Chrome's string form.
    const executeObject = mc.executeTool as unknown as (
      registeredTool: typeof tool,
      input: Readonly<Record<string, unknown>>,
    ) => Promise<unknown>
    try {
      await executeObject.call(mc, tool, call.args)
    } catch {
      await mc.executeTool(tool, JSON.stringify(call.args))
    }
  }
  return { ...plan, executed: true }
}

/**
 * Deterministic in-page rehearsal. It resolves the same intent plan and runs
 * the exact registered ToolDef handlers through the registry's shared
 * mirror/log execution path, without relying on a host's page-callable
 * `executeTool()` implementation. Because `create_view`'s handler commissions
 * the view (registering + focusing its family), later steps of the same plan
 * find their tools exactly as an agent's sequential calls would.
 */
export async function runLocalIntent(transcript: string): Promise<RunResult> {
  const plan = planIntent(transcript, currentContext())
  if (plan.plan.length === 0) return { ...plan, executed: false, failure: 'unmatched' }
  for (const call of plan.plan) {
    const executed = await registry.executeLocal(call.tool, call.args)
    if (!executed) return { ...plan, executed: false, failure: 'tool-not-found' }
  }
  return { ...plan, executed: true }
}

// --- Dev/test hook ----------------------------------------------------------
// The SILENT console hook — with no on-page form, this is the only human
// entry to the workbench (a demo/QA affordance, not a product surface):
//   await window.__auricleRunIntent('when was the hottest year')
// It prefers the agent-identical path (`document.modelContext.executeTool`) in
// a WebMCP host and falls back to the registry's local execution — the SAME
// registered ToolDef handlers, mirror bus, and log — in a plain browser.
// Guarded to the browser; harmless in Node/tests. Intentionally left in.
declare global {
  interface Window {
    __auricleRunIntent?: (transcript: string) => Promise<RunResult>
  }
}
if (typeof window !== 'undefined') {
  window.__auricleRunIntent = async (transcript: string) => {
    const viaHost = await runIntent(transcript)
    if (
      !viaHost.executed &&
      (viaHost.failure === 'webmcp-unavailable' || viaHost.failure === 'execute-unsupported')
    ) {
      return runLocalIntent(transcript)
    }
    return viaHost
  }
}
