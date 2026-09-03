/**
 * intents.ts — a DEMO-ONLY intent matcher that simulates an agent locally.
 *
 * ⚠️ HONESTY NOTE FOR THE SUBMISSION: this is NOT natural-language understanding
 * and it is NOT Auricle's primary interaction path. The product's primary path
 * is the browser agent (for example Codex using ChatGPT Site Tools) that reads
 * the registered tools and calls them. This matcher is a tiny, readable table of a
 * FEW REHEARSED regex patterns → WebMCP tool-call plans, so the full
 * voice → tool → mirror → log loop can be rehearsed in WebMCP-enabled Chrome.
 *
 * It drives the SAME registered tools an agent would, via `document.modelContext`
 * (`getTools()` + `executeTool(tool, JSON.stringify(args))`), so the page mirror,
 * the activity log, and the highlight ring all fire IDENTICALLY to an agent call.
 * The control that calls this runner is hidden unless the imperative testing
 * API is present; execution failures are also reported by `RunResult`.
 *
 * Because only the focused chart's tool family is registered, intents that target
 * a specific chart's tool are planned as `focus_chart(<id>)` THEN the query/sonify
 * tool. `planIntent` is a pure function (transcript + focus context → ordered
 * plan) and is unit-tested browserless in `src/voice.check.mts`.
 */

import { CHART_IDS } from '../dashboard/charts.ts'
import { getFocus, DEFAULT_FOCUS } from '../dashboard/focus.ts'
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
  /** Ordered tool calls to run (focus-then-act where a chart is targeted). */
  readonly plan: readonly ToolCall[]
}

/** Focus context the pure planner needs (kept out of the planner for testability). */
export interface IntentContext {
  /** The currently focused chart id, or null. */
  readonly focusedId: string | null
}

// --- Chart-id helpers (names computed from CHART_IDS, not hardcoded) ---------

const IDS = new Set<string>(CHART_IDS)
const MAIZE = 'maize-prices'
const MORTALITY = 'under5-mortality'
const YIELD = 'yield-fertilizer'
const EXCHANGE = 'exchange-rate'

/** Map a spoken word to a chart id (used by the "focus …" intent). */
function chartIdFromWords(text: string): string | null {
  if (/\b(maize|meal|price)\b/i.test(text)) return MAIZE
  if (/\b(mortality|child|children|under[\s-]?5|deaths?)\b/i.test(text)) return MORTALITY
  if (/\b(yield|fertili[sz]er|crop|harvest)\b/i.test(text)) return YIELD
  if (/\b(exchange|kwacha|dollar|usd|rate|currency|forex|fx)\b/i.test(text)) return EXCHANGE
  return null
}

/** `focus_chart` call for a chart id. */
function focusCall(chartId: string): ToolCall {
  return { tool: 'focus_chart', args: { chart_id: chartId } }
}

/**
 * Plan the tool calls for a chart-targeted intent: prepend `focus_chart` unless
 * that chart is already focused, then the family tool.
 */
function focusThen(chartId: string, familyTool: ToolCall, ctx: IntentContext): ToolCall[] {
  const calls: ToolCall[] = []
  if (ctx.focusedId !== chartId) calls.push(focusCall(chartId))
  calls.push(familyTool)
  return calls
}

// --- The rehearsed intent table ---------------------------------------------
// First match wins. Each `resolve` returns an ordered plan given focus context.

interface IntentRule {
  readonly intent: string
  readonly test: RegExp
  resolve(transcript: string, ctx: IntentContext): ToolCall[]
}

const RULES: readonly IntentRule[] = [
  // "what's on the screen" / "describe the screen" / "where am i"
  {
    intent: 'describe-screen',
    test: /(what'?s|what is)\s+on\s+(the\s+)?screen|describe\s+(the\s+)?screen|where\s+am\s+i|orient/i,
    resolve: () => [{ tool: 'describe_screen', args: {} }],
  },
  // "compare countries" — mortality's cross-country comparison.
  {
    intent: 'compare-countries',
    test: /compare\b/i,
    resolve: (_t, ctx) =>
      focusThen(MORTALITY, { tool: `${MORTALITY}_compare_countries`, args: {} }, ctx),
  },
  // "How much did maize rise from 2022 [to 2025]?" — the video range beat.
  {
    intent: 'maize-range',
    test: /(?:how much|change|rise|rose|increase).*(?:from|between)\s+20\d{2}/i,
    resolve: (text, ctx) => {
      const years = Array.from(text.matchAll(/\b(20\d{2})\b/g), (match) => match[1])
      if (!years[0]) return []
      return focusThen(
        MAIZE,
        {
          tool: `${MAIZE}_query_range`,
          args: { start: `${years[0]}-01`, end: `${years[1] ?? '2025'}-01` },
        },
        ctx,
      )
    },
  },
  // "when did maize spike" / "what's the peak" / "highest" — maize extremes.
  {
    intent: 'maize-extremes',
    test: /\bspik|\bpeak|\bhighest|\bmost expensive|when did .*(rise|jump)/i,
    resolve: (_t, ctx) =>
      focusThen(MAIZE, { tool: `${MAIZE}_find_extremes`, args: {} }, ctx),
  },
  // "play it as sound" / "sonify" / "let me hear it" — sonify the focused chart.
  {
    intent: 'sonify',
    test: /play\s+(it|that|this)?\s*(as\s+)?sound|sonif|let me hear|hear (it|that|this)|as sound/i,
    resolve: (_t, ctx) => {
      const chartId = ctx.focusedId && IDS.has(ctx.focusedId) ? ctx.focusedId : DEFAULT_FOCUS
      return [{ tool: `${chartId}_sonify`, args: {} }]
    },
  },
  // "focus the maize / mortality / yield / exchange …" — explicit focus verb.
  {
    intent: 'focus-chart',
    test: /\bfocus\b|\bshow me\b|\bswitch to\b|\bgo to\b/i,
    resolve: (t) => {
      const chartId = chartIdFromWords(t)
      return chartId ? [focusCall(chartId)] : []
    },
  },
]

/**
 * Resolve a transcript to an ordered WebMCP tool-call plan. PURE — no browser,
 * no side effects. `ctx.focusedId` decides whether a `focus_chart` prefix is
 * needed. Unmatched transcripts return `{ intent: 'none', plan: [] }` (the agent
 * would handle those; here we just show the transcript as the question).
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
 * `focus_chart` step registers the chart's family before the next step looks it
 * up. Returns the plan regardless; `executed` is false when `document.modelContext`
 * is absent (voice still displays the transcript in that case).
 */
export async function runIntent(transcript: string): Promise<RunResult> {
  const plan = planIntent(transcript, { focusedId: getFocus() })
  const mc = getModelContext()
  if (plan.plan.length === 0) return { ...plan, executed: false, failure: 'unmatched' }
  if (!mc) return { ...plan, executed: false, failure: 'webmcp-unavailable' }
  if (typeof mc.getTools !== 'function' || typeof mc.executeTool !== 'function') {
    return { ...plan, executed: false, failure: 'execute-unsupported' }
  }
  for (const call of plan.plan) {
    // Re-read the tool list each step: after focus_chart runs, the newly focused
    // chart's family is registered and its tool becomes findable here.
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
 * `executeTool()` implementation.
 */
export async function runLocalIntent(transcript: string): Promise<RunResult> {
  const plan = planIntent(transcript, { focusedId: getFocus() })
  if (plan.plan.length === 0) return { ...plan, executed: false, failure: 'unmatched' }
  for (const call of plan.plan) {
    const executed = await registry.executeLocal(call.tool, call.args)
    if (!executed) return { ...plan, executed: false, failure: 'tool-not-found' }
  }
  return { ...plan, executed: true }
}

// --- Dev/test hook ----------------------------------------------------------
// Exposes `runIntent` on `window.__auricleRunIntent` so the integrating agent
// can drive the loop from the browser console WITHOUT real speech, e.g.
//   await window.__auricleRunIntent('when did maize spike')
// Guarded to the browser; harmless in Node/tests. Genuinely useful for the
// demo and for QA in a WebMCP-flagged Chrome, so it is intentionally left in.
declare global {
  interface Window {
    __auricleRunIntent?: (transcript: string) => Promise<RunResult>
  }
}
if (typeof window !== 'undefined') {
  window.__auricleRunIntent = runIntent
}
