/**
 * registry.smoke.mts — browserless smoke test for the agent-a11y registry.
 *
 * Mocks `globalThis.document.modelContext` with an in-memory implementation of
 * registerTool/getTools/executeTool (aborting a tool's signal unregisters it,
 * exactly like Chrome's WebMCP), then exercises the focus model end to end.
 *
 * Run:  npx tsx src/lib/agent-a11y/registry.smoke.mts
 */

import assert from 'node:assert/strict'

// --- In-memory WebMCP mock ------------------------------------------------
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

async function toolNames(): Promise<string[]> {
  const mc = (globalThis as unknown as { document: Document }).document.modelContext!
  const tools = await mc.getTools()
  return tools.map((t) => t.name).sort()
}

// --- Test ------------------------------------------------------------------
async function main() {
  installMockModelContext()

  // Import AFTER the mock is installed (module reads document lazily anyway).
  const { createRegistry } = await import('./registry.ts')
  const reg = createRegistry()

  assert.equal(reg.isAvailable(), true, 'isAvailable() true with mock present')

  // Global orientation tools — always available.
  const schema = { type: 'object', properties: {} }
  reg.registerGlobal({
    name: 'describe_screen',
    description: 'Describe the whole screen.',
    inputSchema: schema,
    execute: () => ({ speech: 'This dashboard shows four Zambian indicators.' }),
  })
  reg.registerGlobal({
    name: 'list_visualizations',
    description: 'List the charts.',
    inputSchema: schema,
    execute: () => ({ speech: 'Four charts: maize, mortality, yield, exchange.' }),
  })
  // Idempotent: re-registering a global does not duplicate it.
  reg.registerGlobal({
    name: 'describe_screen',
    description: 'dupe',
    inputSchema: schema,
    execute: () => ({ speech: 'dupe' }),
  })

  const GLOBALS = ['describe_screen', 'list_visualizations']
  assert.deepEqual(await toolNames(), [...GLOBALS].sort(), 'only globals before focus')

  // Two surfaces, each with a focus-scoped family.
  reg.registerSurface('maize', {
    describe: 'Maize retail price, monthly.',
    tools: [
      {
        name: 'query_point',
        description: 'Value at a month.',
        inputSchema: schema,
        execute: (args) => ({
          speech: `Maize was K${String((args as { v?: number }).v ?? 0)}.`,
          mirror: { kind: 'highlight-range', chartId: 'maize', start: '2022-01', end: '2022-01' },
        }),
        argsSummary: (args) => `query_point(${String((args as { month?: string }).month ?? '?')})`,
      },
    ],
  })
  reg.registerSurface('mortality', {
    describe: 'Under-5 mortality, yearly.',
    tools: [
      {
        name: 'query_trend',
        description: 'Overall trend.',
        inputSchema: schema,
        execute: () => ({ speech: 'Under-5 mortality fell 38%.' }),
      },
    ],
  })

  // focus(A) → globals + A only
  reg.focus('maize')
  assert.deepEqual(await toolNames(), [...GLOBALS, 'query_point'].sort(), 'focus(maize): globals + maize')

  // idempotent re-focus does not throw or duplicate
  reg.focus('maize')
  assert.deepEqual(await toolNames(), [...GLOBALS, 'query_point'].sort(), 're-focus(maize) idempotent')

  // focus(B) → globals + B only (A unregistered)
  reg.focus('mortality')
  assert.deepEqual(await toolNames(), [...GLOBALS, 'query_trend'].sort(), 'focus(mortality): globals + mortality')

  // blur → globals only
  reg.blur()
  assert.deepEqual(await toolNames(), [...GLOBALS].sort(), 'blur(): only globals')
  reg.blur() // safe double-blur
  assert.deepEqual(await toolNames(), [...GLOBALS].sort(), 'double blur() safe')

  // Execute a tool through WebMCP: assert serialized shape + log + mirror.
  const mirrored: unknown[] = []
  reg.mirror.subscribe((e) => mirrored.push(e))
  reg.focus('maize')
  const mc = (globalThis as unknown as { document: Document }).document.modelContext!
  const tools = await mc.getTools()
  const queryPoint = tools.find((t) => t.name === 'query_point')!
  const result = (await mc.executeTool!(queryPoint, JSON.stringify({ month: '2022-01', v: 134 }))) as {
    content: { type: string; text: string }[]
  }

  assert.deepEqual(
    result,
    { content: [{ type: 'text', text: 'Maize was K134.' }] },
    'execute returns { content: [{ type:text, text: speech }] }',
  )

  const log = reg.log.getSnapshot()
  assert.equal(log.length, 1, 'one log entry appended')
  assert.equal(log[0].tool, 'query_point', 'log entry names the tool')
  assert.equal(log[0].argsSummary, 'query_point(2022-01)', 'per-tool argsSummary override used')
  assert.equal(log[0].speech, 'Maize was K134.', 'log entry carries the speech')
  assert.equal(typeof log[0].ts, 'number', 'log entry has a timestamp')

  assert.equal(mirrored.length, 1, 'one mirror event dispatched')
  assert.deepEqual(
    mirrored[0],
    { kind: 'highlight-range', chartId: 'maize', start: '2022-01', end: '2022-01' },
    'mirror event forwarded verbatim',
  )

  // --- No-op path: no document.modelContext ---
  delete (globalThis as { document?: unknown }).document
  const off = createRegistry()
  assert.equal(off.isAvailable(), false, 'isAvailable() false without WebMCP')
  // None of these throw:
  off.registerGlobal({
    name: 'describe_screen',
    description: 'x',
    inputSchema: schema,
    execute: () => ({ speech: 'x' }),
  })
  off.registerSurface('s', { describe: 's', tools: [] })
  off.focus('s')
  off.focus('s')
  off.blur()
  off.blur()
  off.unregisterSurface('s')
  assert.equal(off.focused, null, 'no-op registry has no focus')

  console.log('ok — all agent-a11y registry assertions passed')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
