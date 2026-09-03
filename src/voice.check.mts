/**
 * voice.check.mts — browserless unit checks for the PURE intent matcher.
 *
 * Web Speech and `document.modelContext` need a real browser, but `planIntent`
 * is a pure function (transcript + workspace/focus context → ordered tool-call
 * plan), so the rehearsed phrases can be asserted headless. This proves each
 * demo phrase resolves to the exact ordered tool names + args an external agent
 * would send under the workspace arc:
 *   - an uncommissioned target chart gets a `create_view` prefix (create_view
 *     commissions AND focuses, so no focus_chart is needed after it),
 *   - a commissioned-but-unfocused target gets a `focus_chart` prefix,
 *   - a focused target gets no prefix at all.
 *
 * Run:  npx tsx src/voice.check.mts
 */

import assert from 'node:assert/strict'
import { planIntent, type IntentContext, type ToolCall } from './voice/intents.ts'

/** Compact a plan to `tool(argsJson)` strings for readable assertions/printing. */
function fmt(plan: readonly ToolCall[]): string[] {
  return plan.map((c) => `${c.tool}(${JSON.stringify(c.args)})`)
}

const SHELF: IntentContext = { focusedId: null, commissioned: [] }
const TEMP_FOCUSED: IntentContext = { focusedId: 'temp-anomaly', commissioned: ['temp-anomaly'] }
const TEMP_UNFOCUSED: IntentContext = {
  focusedId: 'co2-emitters',
  commissioned: ['temp-anomaly', 'co2-emitters'],
}
const EMITTERS_FOCUSED: IntentContext = {
  focusedId: 'co2-emitters',
  commissioned: ['temp-anomaly', 'co2-emitters'],
}
const LIVE_FOCUSED: IntentContext = { focusedId: 'co2-live', commissioned: ['co2-live'] }

interface Case {
  transcript: string
  ctx: IntentContext
  intent: string
  expect: string[]
}

const CASES: Case[] = [
  // describe the screen → the global orientation tool, works in any state.
  {
    transcript: 'describe the screen',
    ctx: SHELF,
    intent: 'describe-screen',
    expect: ['describe_screen({})'],
  },
  {
    transcript: 'where am I',
    ctx: TEMP_FOCUSED,
    intent: 'describe-screen',
    expect: ['describe_screen({})'],
  },
  // "show me warming over time" on the shelf → commission the warming curve.
  {
    transcript: 'show me warming over time',
    ctx: SHELF,
    intent: 'create-warming',
    expect: ['create_view({"dataset":"temp-anomaly"})'],
  },
  {
    transcript: 'build the warming chart',
    ctx: SHELF,
    intent: 'create-warming',
    expect: ['create_view({"dataset":"temp-anomaly"})'],
  },
  // …already commissioned → just refocus it.
  {
    transcript: 'show me warming over time',
    ctx: TEMP_UNFOCUSED,
    intent: 'create-warming',
    expect: ['focus_chart({"chart_id":"temp-anomaly"})'],
  },
  // "when was the hottest year" on the shelf → commission, then find_extremes
  // (create_view focuses, so NO focus_chart in between).
  {
    transcript: 'when was the hottest year',
    ctx: SHELF,
    intent: 'hottest-year',
    expect: ['create_view({"dataset":"temp-anomaly"})', 'temp-anomaly_find_extremes({})'],
  },
  // …commissioned but unfocused → focus_chart prefix instead of create_view.
  {
    transcript: "what's the peak",
    ctx: TEMP_UNFOCUSED,
    intent: 'hottest-year',
    expect: ['focus_chart({"chart_id":"temp-anomaly"})', 'temp-anomaly_find_extremes({})'],
  },
  // …already focused → no prefix at all.
  {
    transcript: 'when did it spike',
    ctx: TEMP_FOCUSED,
    intent: 'hottest-year',
    expect: ['temp-anomaly_find_extremes({})'],
  },
  // "who emits the most" on the shelf → commission emitters + compare.
  {
    transcript: 'who emits the most',
    ctx: SHELF,
    intent: 'compare-emitters',
    expect: ['create_view({"dataset":"co2-emitters"})', 'co2-emitters_compare_emitters({})'],
  },
  // …emitters focused → straight to the ranking.
  {
    transcript: 'who emits the most',
    ctx: EMITTERS_FOCUSED,
    intent: 'compare-emitters',
    expect: ['co2-emitters_compare_emitters({})'],
  },
  // The range beat: years are parsed and passed through.
  {
    transcript: 'How much did it warm from 1950?',
    ctx: TEMP_FOCUSED,
    intent: 'warming-range',
    expect: ['temp-anomaly_query_range({"start":1950,"end":2025})'],
  },
  // "what's CO2 right now" on the shelf → commission the live feed + read it.
  {
    transcript: "what's CO2 right now",
    ctx: SHELF,
    intent: 'current-co2',
    expect: ['create_view({"dataset":"co2-live"})', 'co2-live_current_value({})'],
  },
  {
    transcript: 'current co2',
    ctx: LIVE_FOCUSED,
    intent: 'current-co2',
    expect: ['co2-live_current_value({})'],
  },
  // "play the century as sound" with nothing focused → the century IS the
  // warming curve: commission it, then sonify.
  {
    transcript: 'play the century as sound',
    ctx: SHELF,
    intent: 'sonify',
    expect: ['create_view({"dataset":"temp-anomaly"})', 'temp-anomaly_sonify({})'],
  },
  // sonify with a focused view → play THAT view.
  {
    transcript: 'play it as sound',
    ctx: LIVE_FOCUSED,
    intent: 'sonify',
    expect: ['co2-live_sonify({})'],
  },
  // "start over" / "clear" → tear the workspace down.
  {
    transcript: 'start over',
    ctx: TEMP_UNFOCUSED,
    intent: 'clear-workspace',
    expect: ['clear_workspace({})'],
  },
  {
    transcript: 'clear the workspace',
    ctx: TEMP_FOCUSED,
    intent: 'clear-workspace',
    expect: ['clear_workspace({})'],
  },
  // unmatched chit-chat → no tool call; the transcript is just shown.
  {
    transcript: 'hello there',
    ctx: SHELF,
    intent: 'none',
    expect: [],
  },
]

let passed = 0
for (const c of CASES) {
  const result = planIntent(c.transcript, c.ctx)
  const got = fmt(result.plan)
  assert.equal(result.intent, c.intent, `intent for "${c.transcript}" → ${c.intent}`)
  assert.deepEqual(got, c.expect, `plan for "${c.transcript}"`)
  const focus = c.ctx.focusedId ?? 'none'
  const ws = c.ctx.commissioned.length ? c.ctx.commissioned.join('+') : 'shelf'
  console.log(
    `ok  [${ws} · focus:${focus}]  "${c.transcript}"  →  ${result.intent}: ${got.length ? got.join(' → ') : '(no tool — shown as question)'}`,
  )
  passed++
}

console.log(
  `\nok — intent matcher: ${passed}/${CASES.length} transcripts resolved to their expected tool plans (commission/focus-then-act sequencing verified).`,
)
