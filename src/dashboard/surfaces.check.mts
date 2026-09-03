/**
 * surfaces.check.mts — browserless check for the per-chart tool families.
 *
 * Installs the same in-memory WebMCP mock the other checks use, registers the
 * globals, then for EVERY dataset: commissions its view via `create_view`
 * (surfaces are born on commission — nothing is pre-registered) and drives
 * EVERY query tool of its family via executeTool with representative args.
 * For each call it asserts:
 *   (a) non-empty speech that contains a real figure (a digit),
 *   (b) where applicable, a mirror event on the bus with the expected `kind`.
 * It also spot-checks exact real figures (+1.28 °C/2024, 38,599 Mt, China
 * 12,289 Mt, 426.94 ppm).
 *
 * Run:  npx tsx src/dashboard/surfaces.check.mts
 */

import assert from 'node:assert/strict'

// --- In-memory WebMCP mock (same shape as the other checks) ----------------
interface MockTool {
  name: string
  description: string
  inputSchema?: object
  execute: (args: Record<string, unknown>) => Promise<unknown>
}

function installMockModelContext(): void {
  const registered = new Set<MockTool>()
  const modelContext = {
    registerTool(tool: MockTool, opts?: { signal?: AbortSignal }) {
      const signal = opts?.signal
      if (signal?.aborted) return Promise.resolve()
      registered.add(tool)
      signal?.addEventListener('abort', () => registered.delete(tool))
      return Promise.resolve()
    },
    getTools() {
      return Promise.resolve([...registered])
    },
    executeTool(tool: MockTool, argsJsonString: string) {
      return tool.execute(JSON.parse(argsJsonString) as Record<string, unknown>)
    },
    ontoolchange: null,
  }
  ;(globalThis as { document?: unknown }).document = { modelContext }
}

function mc() {
  return (globalThis as unknown as { document: Document }).document.modelContext!
}

const HAS_DIGIT = /\d/

async function main() {
  installMockModelContext()

  const { registerOrientationTools } = await import('./orientation.ts')
  const { registry } = await import('../lib/agent-a11y/registry.ts')
  const { CHARTS } = await import('./charts.ts')

  registerOrientationTools()

  // Capture every mirror event the executed tools emit.
  let lastMirror: { kind: string } & Record<string, unknown>
  lastMirror = { kind: '(none)' }
  registry.mirror.subscribe((e) => {
    lastMirror = e
  })

  async function exec(name: string, args: Record<string, unknown> = {}) {
    const tools = await mc().getTools()
    const tool = tools.find((t) => t.name === name)
    assert.ok(tool, `tool ${name} is registered while its view is commissioned+focused`)
    lastMirror = { kind: '(none)' }
    const result = (await mc().executeTool!(tool, JSON.stringify(args))) as {
      content: { type: string; text: string }[]
    }
    return { speech: result.content[0].text, mirror: lastMirror }
  }

  /** Expectation row: [toolName, args, expectedMirrorKind|null, mustInclude[]] */
  type Row = [string, Record<string, unknown>, string | null, string[]]

  const plan: Record<string, Row[]> = {
    'temp-anomaly': [
      ['temp-anomaly_query_point', { year: 2024 }, 'highlight-point', ['+1.28', '°C', 'record']],
      ['temp-anomaly_query_range', { start: 1950, end: 2024 }, 'highlight-range', ['°C', '1951–1980']],
      ['temp-anomaly_find_extremes', {}, 'highlight-point', ['+1.28', '2024']],
      ['temp-anomaly_describe_trend', {}, 'highlight-range', ['+1.28', '2024', '146']],
    ],
    'co2-emitters': [
      ['co2-emitters_query_point', { year: 1990 }, 'highlight-point', ['million tonnes']],
      ['co2-emitters_query_range', { start: 1950, end: 2024 }, 'highlight-range', ['×', 'Mt']],
      ['co2-emitters_find_extremes', {}, 'highlight-point', ['38,599', '2024']],
      ['co2-emitters_describe_trend', {}, 'highlight-range', ['38,599', 'China']],
      ['co2-emitters_compare_emitters', {}, 'bar-emphasis', ['China', '12,289']],
    ],
    'wealth-carbon': [
      // 164 countries (the widened dataset) and the REAL recomputed r≈0.78.
      ['wealth-carbon_describe_relationship', {}, 'scatter-ring', ['r≈0.78', '164', '2022']],
      ['wealth-carbon_query_nearest', { country: 'India' }, 'scatter-ring', ['India', 'GDP']],
    ],
    'co2-live': [
      ['co2-live_current_value', {}, 'highlight-point', ['426.94', 'ppm']],
      ['co2-live_session_stats', {}, 'highlight-point', ['ppm']],
    ],
  }

  const samples: string[] = []
  let count = 0

  for (const chart of CHARTS) {
    // Commission via the tool so the family registers exactly as the agent would
    // (create_view births the surface AND focuses it).
    await exec('create_view', { dataset: chart.id })
    for (const [name, args, kind, mustInclude] of plan[chart.id]) {
      const { speech, mirror } = await exec(name, args)
      assert.ok(speech.length > 0, `${name}: non-empty speech`)
      assert.ok(HAS_DIGIT.test(speech), `${name}: speech contains a real figure`)
      for (const frag of mustInclude) {
        assert.ok(speech.includes(frag), `${name}: speech includes "${frag}" — got: ${speech}`)
      }
      // Every query tool steers to a next step.
      assert.ok(/ask |You can ask/i.test(speech), `${name}: speech ends with a steering suggestion`)
      if (kind) {
        assert.equal(mirror.kind, kind, `${name}: emits mirror kind "${kind}"`)
        assert.equal(mirror.chartId, chart.id, `${name}: mirror targets ${chart.id}`)
      }
      count++
    }
    // Grab one sample speech per chart for eyeballing.
    const s = await exec(plan[chart.id][0][0], plan[chart.id][0][1])
    samples.push(`[${chart.id}] ${s.speech}`)
  }

  // A couple of extra spot-checks on exact figures / mirror payloads.
  await exec('focus_chart', { chart_id: 'temp-anomaly' })
  const range = await exec('temp-anomaly_query_range', { start: 1880, end: 2024 })
  assert.ok(range.speech.includes('−0.17'), `range starts from the real 1880 anomaly — got: ${range.speech}`)
  assert.ok(range.speech.includes('+1.28'), `range ends at the real 2024 record — got: ${range.speech}`)

  await exec('focus_chart', { chart_id: 'co2-emitters' })
  const cmp = await exec('co2-emitters_compare_emitters', {})
  assert.equal(cmp.mirror.country, 'China', 'compare_emitters emphasises the China bar')
  assert.ok(cmp.speech.includes('more than the next two combined'), 'compare_emitters computes the real lead')

  await exec('focus_chart', { chart_id: 'wealth-carbon' })
  const nearest = await exec('wealth-carbon_query_nearest', { country: 'Norway' })
  assert.ok(nearest.speech.includes('88,366'), `Norway GDP/capita $88,366 — got: ${nearest.speech}`)

  console.log('\n--- sample speech (one per chart) ---')
  for (const s of samples) console.log('\n' + s)

  console.log(`\nok — drove ${count} tools across ${CHARTS.length} families; all assertions passed`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
