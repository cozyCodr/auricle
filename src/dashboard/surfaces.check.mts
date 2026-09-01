/**
 * surfaces.check.mts — browserless check for the 3.2 per-chart tool families.
 *
 * Installs the same in-memory WebMCP mock the 2.1/2.2 checks use, registers the
 * dashboard, then for EVERY chart: focuses it and drives EVERY tool of its family
 * via executeTool with representative args. For each call it asserts:
 *   (a) non-empty speech that contains a real figure (a digit), and
 *   (b) where applicable, a mirror event on the bus with the expected `kind`.
 * It also spot-checks a few exact figures (12.11, 148.9%, 74.3, 48.4, 19.05).
 *
 * Run:  npx tsx src/dashboard/surfaces.check.mts
 */

import assert from 'node:assert/strict'

// --- In-memory WebMCP mock (copied from orientation.check.mts) -------------
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
  const { CHART_SURFACES } = await import('./surfaces.ts')
  const { CHARTS } = await import('./charts.ts')

  registerOrientationTools()
  for (const chart of CHARTS) registry.registerSurface(chart.id, CHART_SURFACES[chart.id])

  // Capture every mirror event the executed tools emit.
  let lastMirror: { kind: string } & Record<string, unknown>
  lastMirror = { kind: '(none)' }
  registry.mirror.subscribe((e) => {
    lastMirror = e
  })

  async function exec(name: string, args: Record<string, unknown> = {}) {
    const tools = await mc().getTools()
    const tool = tools.find((t) => t.name === name)
    assert.ok(tool, `tool ${name} is registered while its chart is focused`)
    lastMirror = { kind: '(none)' }
    const result = (await mc().executeTool!(tool, JSON.stringify(args))) as {
      content: { type: string; text: string }[]
    }
    return { speech: result.content[0].text, mirror: lastMirror }
  }

  /** Expectation row: [chartId, toolName, args, expectedMirrorKind|null, mustInclude[]] */
  type Row = [string, string, Record<string, unknown>, string | null, string[]]

  const plan: Record<string, Row[]> = {
    'maize-prices': [
      ['maize-prices', 'maize-prices_query_point', { date: '2025-01' }, 'highlight-point', ['12.11', 'ZMW/kg']],
      ['maize-prices', 'maize-prices_query_range', { start: '2022-01', end: '2024-12' }, 'highlight-range', ['%']],
      ['maize-prices', 'maize-prices_find_extremes', {}, 'highlight-point', ['12.11']],
      ['maize-prices', 'maize-prices_describe_trend', {}, 'highlight-range', ['5.6']],
    ],
    'under5-mortality': [
      ['under5-mortality', 'under5-mortality_query_point', { year: 2010 }, 'highlight-point', ['74.3']],
      ['under5-mortality', 'under5-mortality_find_extremes', {}, 'highlight-range', ['151.8', '48.4']],
      ['under5-mortality', 'under5-mortality_describe_trend', {}, 'highlight-range', ['48.4']],
      ['under5-mortality', 'under5-mortality_compare_countries', {}, 'bar-emphasis', ['48.4', 'mid-pack']],
    ],
    'yield-fertilizer': [
      ['yield-fertilizer', 'yield-fertilizer_describe_relationship', {}, 'scatter-ring', ['r≈']],
      ['yield-fertilizer', 'yield-fertilizer_query_nearest', { year: 2010 }, 'scatter-ring', ['kg/ha']],
    ],
    'exchange-rate': [
      ['exchange-rate', 'exchange-rate_current_value', {}, 'highlight-point', ['19.05', 'ZMW/USD']],
      ['exchange-rate', 'exchange-rate_session_stats', {}, 'highlight-point', ['ZMW/USD']],
    ],
  }

  const samples: string[] = []
  let count = 0

  for (const chart of CHARTS) {
    // Focus via the tool so the family registers exactly as the agent would.
    await exec('focus_chart', { chart_id: chart.id })
    for (const [, name, args, kind, mustInclude] of plan[chart.id]) {
      const { speech, mirror } = await exec(name, args)
      assert.ok(speech.length > 0, `${name}: non-empty speech`)
      assert.ok(HAS_DIGIT.test(speech), `${name}: speech contains a real figure`)
      for (const frag of mustInclude) {
        assert.ok(speech.includes(frag), `${name}: speech includes "${frag}" — got: ${speech}`)
      }
      // Every 3.2 tool steers to a next step.
      assert.ok(/ask |You can ask/i.test(speech), `${name}: speech ends with a steering suggestion`)
      if (kind) {
        assert.equal(mirror.kind, kind, `${name}: emits mirror kind "${kind}"`)
        assert.equal(mirror.chartId, chart.id, `${name}: mirror targets ${chart.id}`)
      }
      count++
    }
    // Grab one sample speech per chart for eyeballing.
    const s = await exec(plan[chart.id][0][1], plan[chart.id][0][2])
    samples.push(`[${chart.id}] ${s.speech}`)
  }

  // A couple of extra spot-checks on exact figures / mirror payloads.
  await exec('focus_chart', { chart_id: 'maize-prices' })
  const range = await exec('maize-prices_query_range', { start: '2022-01', end: '2024-12' })
  assert.ok(range.speech.includes('148.9'), `maize query_range computes +148.9% — got: ${range.speech}`)
  assert.ok(String(range.mirror.label).includes('148.9'), 'range mirror carries the % label')

  await exec('focus_chart', { chart_id: 'under5-mortality' })
  const cmp = await exec('under5-mortality_compare_countries', {})
  assert.equal(cmp.mirror.country, 'Zambia', 'compare_countries emphasises the Zambia bar')

  console.log('\n--- sample speech (one per chart) ---')
  for (const s of samples) console.log('\n' + s)

  console.log(`\nok — drove ${count} tools across ${CHARTS.length} families; all assertions passed`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
