/**
 * orientation.check.mts — browserless check for the 2.2 orientation tools.
 *
 * Installs the same in-memory WebMCP mock the registry smoke test uses, then:
 *  - registers the three global tools + the four chart surfaces,
 *  - executes describe_screen and asserts real figures appear (12.11, 48.4),
 *  - executes list_visualizations and asserts all four ids appear,
 *  - executes focus_chart(maize-prices) then focus_chart(under5-mortality) and
 *    asserts getTools() swaps families (maize gone, mortality present) while the
 *    three globals stay registered throughout.
 *
 * Run:  npx tsx src/dashboard/orientation.check.mts
 */

import assert from 'node:assert/strict'

// --- In-memory WebMCP mock (copied from registry.smoke.mts) ----------------
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

async function toolNames(): Promise<string[]> {
  const tools = await mc().getTools()
  return tools.map((t) => t.name).sort()
}

async function exec(name: string, args: Record<string, unknown> = {}): Promise<string> {
  const tools = await mc().getTools()
  const tool = tools.find((t) => t.name === name)
  assert.ok(tool, `tool ${name} is registered`)
  const result = (await mc().executeTool!(tool, JSON.stringify(args))) as {
    content: { type: string; text: string }[]
  }
  return result.content[0].text
}

const GLOBALS = ['describe_screen', 'list_visualizations', 'focus_chart']

async function main() {
  installMockModelContext()

  // Import AFTER the mock is installed.
  const { registerOrientationTools } = await import('./orientation.ts')
  const { registry } = await import('../lib/agent-a11y/registry.ts')
  const { CHART_SURFACES } = await import('./surfaces.ts')
  const { CHARTS } = await import('./charts.ts')

  assert.equal(registry.isAvailable(), true, 'isAvailable() true with mock present')

  registerOrientationTools()
  for (const chart of CHARTS) registry.registerSurface(chart.id, CHART_SURFACES[chart.id])

  // Only globals registered before any focus.
  assert.deepEqual(await toolNames(), [...GLOBALS].sort(), 'only globals before focus')

  // describe_screen — real figures present.
  const desc = await exec('describe_screen')
  assert.ok(desc.includes('12.11'), 'describe_screen speech contains maize peak 12.11')
  assert.ok(desc.includes('48.4'), 'describe_screen speech contains under-5 48.4')
  assert.ok(desc.includes('focus_chart'), 'describe_screen steers to focus_chart')

  // list_visualizations — all four ids present.
  const list = await exec('list_visualizations')
  for (const id of ['maize-prices', 'under5-mortality', 'yield-fertilizer', 'exchange-rate']) {
    assert.ok(list.includes(id), `list_visualizations mentions ${id}`)
  }

  // focus_chart(maize-prices) → globals + maize family.
  const maizeSpeech = await exec('focus_chart', { chart_id: 'maize-prices' })
  assert.ok(maizeSpeech.startsWith('Focused Maize meal retail price.'), 'focus speech names maize')
  assert.deepEqual(
    await toolNames(),
    [...GLOBALS, 'maize-prices_describe_trend'].sort(),
    'focus(maize): globals + maize family',
  )

  // focus_chart(under5-mortality) → maize family gone, mortality present, globals intact.
  await exec('focus_chart', { chart_id: 'under5-mortality' })
  const afterSwap = await toolNames()
  assert.deepEqual(
    afterSwap,
    [...GLOBALS, 'under5-mortality_describe_trend'].sort(),
    'focus(under5): globals + mortality family only',
  )
  assert.ok(!afterSwap.includes('maize-prices_describe_trend'), 'maize family unregistered after swap')
  assert.ok(afterSwap.includes('under5-mortality_describe_trend'), 'mortality family present after swap')
  for (const g of GLOBALS) assert.ok(afterSwap.includes(g), `global ${g} still registered after swaps`)

  // Unknown id: helpful, non-throwing.
  const bad = await exec('focus_chart', { chart_id: 'nope' })
  assert.ok(bad.includes('Valid ids'), 'unknown chart_id returns a helpful message')

  // Print sample speech for the integrating agent to eyeball.
  console.log('\n--- describe_screen ---\n' + desc)
  console.log('\n--- focus_chart(maize-prices) ---\n' + maizeSpeech)
  console.log('\n--- list_visualizations ---\n' + list)

  console.log('\nok — all orientation-tool assertions passed')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
