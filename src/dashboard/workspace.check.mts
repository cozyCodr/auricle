/**
 * workspace.check.mts — browserless check for the workspace arc (P0-01).
 *
 * Installs the same in-memory WebMCP mock the other checks use, then proves the
 * commission lifecycle end to end:
 *   1. boot: register the globals — getTools() holds ONLY the five globals; no
 *      chart family exists (surfaces are born on commission, not at boot),
 *   2. create_view(temp-anomaly): the workspace holds the view AND the
 *      temp-anomaly family appears in getTools(),
 *   3. create_view(temp-anomaly) again: idempotent (one view, same tools),
 *   4. create_view(co2-emitters): focus swaps — temp family gone, emitters live,
 *   5. clear_workspace: every family gone, only globals remain, workspace empty,
 *      and describe_screen narrates the shelf again.
 *
 * Run:  npx tsx src/dashboard/workspace.check.mts
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

const GLOBALS = [
  'describe_screen',
  'list_visualizations',
  'create_view',
  'clear_workspace',
  'focus_chart',
].sort()

async function main() {
  installMockModelContext()

  // Import AFTER the mock is installed.
  const { registerOrientationTools } = await import('./orientation.ts')
  const { registry } = await import('../lib/agent-a11y/registry.ts')
  const { getWorkspace, getWorkspaceIds, kindsFor, removeView, hasView } = await import('./workspace.ts')
  const { toolNamesFor } = await import('./surfaces.ts')

  assert.equal(registry.isAvailable(), true, 'isAvailable() true with mock present')

  // 1. Boot: globals only. NO chart family, NO focused surface.
  registerOrientationTools()
  assert.deepEqual(await toolNames(), GLOBALS, 'boot: ONLY the five globals registered')
  assert.equal(getWorkspace().length, 0, 'boot: workspace empty')
  assert.equal(registry.focused, null, 'boot: nothing focused')

  const shelfSpeech = await exec('describe_screen')
  assert.ok(shelfSpeech.includes('Zero answers'), 'shelf describe_screen says "Zero answers"')
  assert.ok(shelfSpeech.includes('create_view'), 'shelf describe_screen steers to create_view')
  assert.ok(/\d/.test(shelfSpeech), 'shelf describe_screen carries real row counts')

  // 2. create_view(temp-anomaly): view + family born at runtime.
  const tempFamily = toolNamesFor('temp-anomaly')
  assert.ok(tempFamily.length >= 5, 'temp family has its full tool set')
  const created = await exec('create_view', { dataset: 'temp-anomaly' })
  assert.ok(created.includes('came online'), 'create_view narrates the family coming online')
  assert.ok(created.includes('+1.28'), `create_view speech carries the real record (+1.28 °C) — got: ${created}`)
  assert.deepEqual(getWorkspaceIds(), ['temp-anomaly'], 'workspace holds the commissioned view')
  assert.equal(registry.focused, 'temp-anomaly', 'the new view is focused')
  assert.deepEqual(
    await toolNames(),
    [...GLOBALS, ...tempFamily].sort(),
    'temp-anomaly family appears in getTools() after create_view',
  )

  // 3. create_view again: idempotent.
  const again = await exec('create_view', { dataset: 'temp-anomaly' })
  assert.ok(again.includes('already'), 'recommissioning narrates idempotence')
  assert.deepEqual(getWorkspaceIds(), ['temp-anomaly'], 'no duplicate view')
  assert.deepEqual(
    await toolNames(),
    [...GLOBALS, ...tempFamily].sort(),
    'tool list unchanged after idempotent create_view',
  )

  // 4. Second commission: focus swaps to the new family.
  const emittersFamily = toolNamesFor('co2-emitters')
  await exec('create_view', { dataset: 'co2-emitters' })
  assert.deepEqual(getWorkspaceIds(), ['temp-anomaly', 'co2-emitters'], 'two views in commission order')
  assert.equal(registry.focused, 'co2-emitters', 'newest view takes focus')
  assert.deepEqual(
    await toolNames(),
    [...GLOBALS, ...emittersFamily].sort(),
    'focus swap: emitters family live, temp family unregistered',
  )

  // focus_chart moves between COMMISSIONED views…
  await exec('focus_chart', { chart_id: 'temp-anomaly' })
  assert.deepEqual(await toolNames(), [...GLOBALS, ...tempFamily].sort(), 'focus_chart swaps back to temp family')
  // …and refuses an uncommissioned one, steering to create_view.
  const refused = await exec('focus_chart', { chart_id: 'wealth-carbon' })
  assert.ok(refused.includes('create_view'), 'focus_chart on the shelf steers to create_view')

  // describe_screen now reflects the workspace state.
  const wsSpeech = await exec('describe_screen')
  assert.ok(wsSpeech.includes('2 live views'), `describe_screen lists 2 live views — got: ${wsSpeech}`)

  // 5. clear_workspace: back to the shelf.
  const cleared = await exec('clear_workspace')
  assert.ok(cleared.includes('raw shelf'), 'clear_workspace narrates the return to the shelf')
  assert.deepEqual(await toolNames(), GLOBALS, 'after clear: ONLY globals remain')
  assert.equal(getWorkspace().length, 0, 'after clear: workspace empty')
  assert.equal(registry.focused, null, 'after clear: nothing focused')
  const shelfAgain = await exec('describe_screen')
  assert.ok(shelfAgain.includes('Zero answers'), 'describe_screen is back to the shelf story')

  // 6. GRAPH VARIETY (P0-01b): same dataset, multiple kinds, ONE family.
  const tempFamily2 = toolNamesFor('temp-anomaly')
  await exec('create_view', { dataset: 'temp-anomaly' }) // canonical line
  const rebuilt = await exec('create_view', { dataset: 'temp-anomaly', kind: 'stripes' })
  assert.ok(rebuilt.includes('stripes'), `kind re-render speech names the kind — got: ${rebuilt}`)
  assert.ok(rebuilt.includes('already live'), 'kind re-render says the tools are already live')
  assert.equal(getWorkspace().length, 2, 'two view instances after line + stripes')
  assert.ok(hasView('temp-anomaly', 'line') && hasView('temp-anomaly', 'stripes'), 'both kinds present')
  assert.deepEqual(getWorkspaceIds(), ['temp-anomaly'], 'ids stay UNIQUE — one dataset, two drawings')
  assert.deepEqual(kindsFor('temp-anomaly'), ['line', 'stripes'], 'kindsFor lists both drawings')
  assert.deepEqual(
    await toolNames(),
    [...GLOBALS, ...tempFamily2].sort(),
    'ONE temp family registered across both views (no duplicate tools)',
  )

  // Idempotent per (dataset, kind) PAIR: re-asking stripes adds nothing.
  const pairAgain = await exec('create_view', { dataset: 'temp-anomaly', kind: 'stripes' })
  assert.ok(pairAgain.includes('already'), 'exact-pair recommission narrates idempotence')
  assert.equal(getWorkspace().length, 2, 'no duplicate (dataset, kind) instance')

  // Invalid (dataset, kind) pair → helpful, NON-THROWING speech listing that
  // dataset's kinds; nothing is commissioned.
  const badPair = await exec('create_view', { dataset: 'wealth-carbon', kind: 'stripes' })
  assert.ok(badPair.includes('scatter') && badPair.includes('stat'), `bad pair lists wealth-carbon's kinds — got: ${badPair}`)
  assert.ok(!getWorkspaceIds().includes('wealth-carbon'), 'bad pair commissions nothing')

  // Removing ONE view keeps the family (a view of the dataset still renders)…
  assert.equal(removeView('temp-anomaly', 'stripes'), true, 'removeView removes the stripes instance')
  assert.equal(getWorkspace().length, 1, 'one temp view left')
  assert.deepEqual(
    await toolNames(),
    [...GLOBALS, ...tempFamily2].sort(),
    'family SURVIVES while any view of the dataset remains',
  )
  // …removing the LAST view tears the family down.
  assert.equal(removeView('temp-anomaly', 'line'), true, 'removeView removes the last temp view')
  assert.deepEqual(await toolNames(), GLOBALS, 'last view gone → family unregistered, globals only')
  assert.equal(getWorkspace().length, 0, 'workspace empty again')
  assert.equal(registry.focused, null, 'nothing focused after the last view is removed')

  console.log('\n--- create_view(temp-anomaly) speech ---\n' + created)
  console.log('\n--- create_view(temp-anomaly, stripes) re-render speech ---\n' + rebuilt)
  console.log('\n--- create_view invalid pair speech ---\n' + badPair)
  console.log('\n--- clear_workspace speech ---\n' + cleared)
  console.log(
    '\nok — workspace arc: boot=globals-only, create_view births view+family (idempotent per ' +
      '(dataset, kind) pair), multiple kinds of one dataset share ONE family, the family dies ' +
      'with its LAST view, focus swaps families, clear_workspace tears it all back to the shelf.',
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
