/**
 * orientation.check.mts — browserless check for the global orientation tools.
 *
 * Installs the same in-memory WebMCP mock the registry smoke test uses, then:
 *  - registers the five global tools (NO chart surfaces — those are born on
 *    commission; the lifecycle itself is covered by workspace.check.mts),
 *  - executes describe_screen on the SHELF and asserts it narrates the raw
 *    tables (real row counts, "Zero answers") and steers to create_view,
 *  - executes list_visualizations on the shelf (all four ids, zero views),
 *  - commissions two views and asserts describe_screen/list_visualizations
 *    flip to the workspace story with real headline figures (+1.28, 38,599),
 *  - asserts focus_chart swaps families between commissioned views while the
 *    globals stay registered, and handles unknown/uncommissioned ids helpfully.
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

const GLOBALS = ['describe_screen', 'list_visualizations', 'create_view', 'clear_workspace', 'focus_chart']
const ALL_IDS = ['temp-anomaly', 'co2-emitters', 'wealth-carbon', 'co2-live']

async function main() {
  installMockModelContext()

  // Import AFTER the mock is installed.
  const { registerOrientationTools } = await import('./orientation.ts')
  const { registry } = await import('../lib/agent-a11y/registry.ts')
  const { toolNamesFor } = await import('./surfaces.ts')

  assert.equal(registry.isAvailable(), true, 'isAvailable() true with mock present')

  registerOrientationTools()

  // Only globals registered at boot — the shelf has no chart surfaces.
  assert.deepEqual(await toolNames(), [...GLOBALS].sort(), 'only the five globals at boot')

  // describe_screen — the shelf story, with real row counts.
  const shelfDesc = await exec('describe_screen')
  assert.ok(shelfDesc.includes('Zero answers'), 'shelf describe_screen tells the truth: zero answers')
  assert.ok(shelfDesc.includes('146 rows'), 'shelf describe_screen counts the real GISTEMP rows')
  assert.ok(shelfDesc.includes('create_view'), 'shelf describe_screen steers to create_view')
  for (const id of ALL_IDS) assert.ok(shelfDesc.includes(id), `shelf describe_screen names ${id}`)

  // list_visualizations — all four ids on the shelf, none commissioned.
  const shelfList = await exec('list_visualizations')
  for (const id of ALL_IDS) assert.ok(shelfList.includes(id), `list_visualizations mentions ${id}`)
  assert.ok(shelfList.includes('No views yet'), 'list_visualizations says the workspace is empty')

  // Commission two views, then re-orient.
  const tempSpeech = await exec('create_view', { dataset: 'temp-anomaly' })
  assert.ok(tempSpeech.includes('came online'), 'create_view narrates the family birth')
  await exec('create_view', { dataset: 'co2-emitters' })

  const wsDesc = await exec('describe_screen')
  assert.ok(wsDesc.includes('+1.28'), 'workspace describe_screen carries the real record (+1.28 °C)')
  assert.ok(wsDesc.includes('38,599'), 'workspace describe_screen carries the real 2024 world total')
  assert.ok(wsDesc.includes('wealth-carbon'), 'workspace describe_screen names the uncommissioned datasets')

  const wsList = await exec('list_visualizations')
  assert.ok(wsList.includes('focused'), 'list_visualizations marks the focused view')
  assert.ok(wsList.includes('On the shelf'), 'list_visualizations lists the remaining shelf datasets')

  // focus_chart(temp-anomaly) → globals + temp family; emitters family gone.
  const tempFamilyNames = toolNamesFor('temp-anomaly')
  const focusSpeech = await exec('focus_chart', { chart_id: 'temp-anomaly' })
  assert.ok(focusSpeech.startsWith('Focused Global temperature anomaly.'), 'focus speech names the view')
  const afterSwap = await toolNames()
  assert.deepEqual(
    afterSwap,
    [...GLOBALS, ...tempFamilyNames].sort(),
    'focus(temp-anomaly): globals + temp family only',
  )
  assert.ok(!afterSwap.includes('co2-emitters_describe_trend'), 'emitters family unregistered after swap')
  for (const g of GLOBALS) assert.ok(afterSwap.includes(g), `global ${g} still registered after swaps`)

  // Uncommissioned id: helpful, steers to create_view. Unknown id: lists valid ids.
  const uncommissioned = await exec('focus_chart', { chart_id: 'co2-live' })
  assert.ok(uncommissioned.includes('create_view'), 'focus_chart on an uncommissioned dataset steers to create_view')
  const bad = await exec('focus_chart', { chart_id: 'nope' })
  assert.ok(bad.includes('Valid ids'), 'unknown chart_id returns a helpful message')

  // Print sample speech for the integrating agent to eyeball.
  console.log('\n--- describe_screen (shelf) ---\n' + shelfDesc)
  console.log('\n--- describe_screen (workspace) ---\n' + wsDesc)
  console.log('\n--- list_visualizations (workspace) ---\n' + wsList)

  console.log('\nok — all orientation-tool assertions passed')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
