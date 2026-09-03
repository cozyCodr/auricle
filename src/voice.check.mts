/**
 * voice.check.mts — browserless unit checks for the PURE intent matcher.
 *
 * Web Speech and `document.modelContext` need a real browser, but `planIntent`
 * is a pure function (transcript + focus context → ordered tool-call plan), so
 * the rehearsed phrases can be asserted headless. This proves each demo phrase
 * resolves to the exact ordered tool names + args an external agent would send,
 * including the focus-then-act sequencing (a `focus_chart` prefix appears only
 * when the target chart isn't already focused).
 *
 * Run:  npx tsx src/voice.check.mts
 */

import assert from 'node:assert/strict'
import { planIntent, type IntentContext, type ToolCall } from './voice/intents.ts'

/** Compact a plan to `tool(argsJson)` strings for readable assertions/printing. */
function fmt(plan: readonly ToolCall[]): string[] {
  return plan.map((c) => `${c.tool}(${JSON.stringify(c.args)})`)
}

const NOTHING_FOCUSED: IntentContext = { focusedId: null }
const MAIZE_FOCUSED: IntentContext = { focusedId: 'maize-prices' }
const MORTALITY_FOCUSED: IntentContext = { focusedId: 'under5-mortality' }
const EXCHANGE_FOCUSED: IntentContext = { focusedId: 'exchange-rate' }

interface Case {
  transcript: string
  ctx: IntentContext
  intent: string
  expect: string[]
}

const CASES: Case[] = [
  // describe the screen → the global orientation tool, no focus needed.
  {
    transcript: 'describe the screen',
    ctx: MAIZE_FOCUSED,
    intent: 'describe-screen',
    expect: ['describe_screen({})'],
  },
  {
    transcript: 'where am I',
    ctx: NOTHING_FOCUSED,
    intent: 'describe-screen',
    expect: ['describe_screen({})'],
  },
  // focus the exchange rate → focus_chart with the mapped id.
  {
    transcript: 'focus the exchange rate',
    ctx: MAIZE_FOCUSED,
    intent: 'focus-chart',
    expect: ['focus_chart({"chart_id":"exchange-rate"})'],
  },
  // "focus the kwacha" maps the spoken word to the exchange-rate chart.
  {
    transcript: 'show me the kwacha',
    ctx: NOTHING_FOCUSED,
    intent: 'focus-chart',
    expect: ['focus_chart({"chart_id":"exchange-rate"})'],
  },
  // when did maize spike → focus maize first (not focused), then find_extremes.
  {
    transcript: 'when did maize spike',
    ctx: NOTHING_FOCUSED,
    intent: 'maize-extremes',
    expect: ['focus_chart({"chart_id":"maize-prices"})', 'maize-prices_find_extremes({})'],
  },
  // …but if maize is ALREADY focused, no redundant focus_chart prefix.
  {
    transcript: "what's the peak",
    ctx: MAIZE_FOCUSED,
    intent: 'maize-extremes',
    expect: ['maize-prices_find_extremes({})'],
  },
  // The second phrase in the submission video must drive the documented range.
  {
    transcript: 'How much did it rise from 2022?',
    ctx: MAIZE_FOCUSED,
    intent: 'maize-range',
    expect: [
      'maize-prices_query_range({"start":"2022-01","end":"2025-01"})',
    ],
  },
  // play it as sound → sonify the FOCUSED chart (exchange here).
  {
    transcript: 'play it as sound',
    ctx: EXCHANGE_FOCUSED,
    intent: 'sonify',
    expect: ['exchange-rate_sonify({})'],
  },
  // sonify with nothing focused → falls back to the default hero (maize).
  {
    transcript: 'let me hear it',
    ctx: NOTHING_FOCUSED,
    intent: 'sonify',
    expect: ['maize-prices_sonify({})'],
  },
  // compare countries → focus mortality first, then compare_countries.
  {
    transcript: 'compare countries',
    ctx: NOTHING_FOCUSED,
    intent: 'compare-countries',
    expect: [
      'focus_chart({"chart_id":"under5-mortality"})',
      'under5-mortality_compare_countries({})',
    ],
  },
  // …already on mortality → no redundant focus.
  {
    transcript: 'compare the countries',
    ctx: MORTALITY_FOCUSED,
    intent: 'compare-countries',
    expect: ['under5-mortality_compare_countries({})'],
  },
  // unmatched chit-chat → no tool call; the transcript is just shown.
  {
    transcript: 'hello there',
    ctx: MAIZE_FOCUSED,
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
  console.log(
    `ok  [focus:${focus}]  "${c.transcript}"  →  ${result.intent}: ${got.length ? got.join(' → ') : '(no tool — shown as question)'}`,
  )
  passed++
}

console.log(`\nok — intent matcher: ${passed}/${CASES.length} transcripts resolved to their expected tool plans (focus-then-act sequencing verified).`)
