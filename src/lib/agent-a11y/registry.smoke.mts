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

interface MockModelContext {
  registerTool(tool: MockTool, opts?: { signal?: AbortSignal }): Promise<void>
  getTools(): Promise<MockTool[]>
  executeTool(tool: MockTool, argsJsonString: string): Promise<unknown>
  ontoolchange: null
}

/**
 * Order-preserving in-memory model context. With `rejectSignalOption`, it
 * behaves like a host without abort support: `registerTool(tool, { signal })`
 * rejects, plain `registerTool(tool)` resolves, and duplicate names reject
 * with an "already registered" error (there is no way to unregister).
 */
function createMockModelContext(opts?: { rejectSignalOption?: boolean }): MockModelContext {
  const registered: MockTool[] = []
  const remove = (tool: MockTool) => {
    const i = registered.indexOf(tool)
    if (i >= 0) registered.splice(i, 1)
  }
  return {
    registerTool(tool: MockTool, o?: { signal?: AbortSignal }) {
      if (opts?.rejectSignalOption) {
        if (o && 'signal' in o && o.signal)
          return Promise.reject(new Error('registerTool: unsupported option "signal"'))
        if (registered.some((t) => t.name === tool.name))
          return Promise.reject(new Error(`Tool "${tool.name}" is already registered`))
      }
      const signal = o?.signal
      if (signal?.aborted) return Promise.resolve()
      registered.push(tool)
      signal?.addEventListener('abort', () => remove(tool))
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
}

function installMockModelContext(): void {
  ;(globalThis as { document?: unknown }).document = { modelContext: createMockModelContext() }
}

/** Flush pending microtask chains (mock promises never use timers). */
function settle(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}

/** Unsorted tool names of a mock host, in registration order. */
async function namesOf(mc: MockModelContext): Promise<string[]> {
  const tools = await mc.getTools()
  return tools.map((t) => t.name)
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

  // Local execution reuses the exact same definition, mirror bus, and log path.
  assert.equal(await reg.executeLocal('query_point', { month: '2022-01', v: 99 }), true)
  assert.equal(reg.log.getSnapshot().length, 2, 'local execution appends to the same log')
  assert.equal(mirrored.length, 2, 'local execution emits on the same mirror bus')
  assert.equal(await reg.executeLocal('missing_tool', {}), false, 'unknown local tool is reported')

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
  assert.equal(await off.executeLocal('describe_screen', {}), true, 'local execution works without WebMCP')
  assert.equal(off.log.getSnapshot()[0]?.speech, 'x', 'no-host local execution is logged')
  off.registerSurface('s', { describe: 's', tools: [] })
  off.focus('s')
  off.focus('s')
  off.blur()
  off.blur()
  off.unregisterSurface('s')
  assert.equal(off.focused, null, 'no-op registry has no focus')

  // --- Scenario: LATE INJECTION (the ChatGPT Site Tools shape) --------------
  // No host at construction; the registry defers, then replays everything the
  // moment a model context appears.
  assert.equal('document' in globalThis, false, 'late-injection scenario starts hostless')
  const late = createRegistry()
  assert.equal(late.isAvailable(), false, 'late: no host yet')
  assert.equal(late.connection().state, 'no-host', 'late: no-host before any registration')

  const lateMirrored: unknown[] = []
  late.mirror.subscribe((e) => lateMirrored.push(e))
  late.registerGlobal({
    name: 'late_describe',
    description: 'Describe the screen.',
    inputSchema: schema,
    execute: () => ({ speech: 'Late-host description.' }),
  })
  late.registerGlobal({
    name: 'late_list',
    description: 'List the charts.',
    inputSchema: schema,
    execute: () => ({ speech: 'Late-host listing.' }),
  })
  late.registerSurface('late-maize', {
    describe: 'Maize price.',
    tools: [
      {
        name: 'late_query',
        description: 'Value at a month.',
        inputSchema: schema,
        execute: (args) => ({
          speech: `Maize was K${String((args as { v?: number }).v ?? 0)}.`,
          mirror: { kind: 'highlight-range', chartId: 'late-maize', start: '2022-01', end: '2022-01' },
        }),
      },
    ],
  })
  late.focus('late-maize')

  // Nothing visible anywhere, but the registry remembers everything.
  assert.equal(late.connection().state, 'waiting', 'late: deferred registrations mark waiting')
  assert.deepEqual(late.connection().registered, [], 'late: nothing registered while hostless')
  assert.equal(late.focused, 'late-maize', 'late: focus tracked while hostless')

  // The host appears AFTER the fact — inject and poke (the browser watcher
  // calls pokeConnection on a timer; the poke is the test seam).
  const lateMc = createMockModelContext()
  ;(globalThis as { document?: unknown }).document = { modelContext: lateMc }
  late.pokeConnection()
  await settle()

  assert.deepEqual(
    await namesOf(lateMc),
    ['late_describe', 'late_list', 'late_query'],
    'late: replay registers globals then the focused family, in order',
  )
  assert.equal(late.connection().state, 'connected', 'late: connected after replay')
  assert.equal(late.connection().host, 'document', 'late: host identified as document')
  assert.deepEqual(
    [...late.connection().registered].sort(),
    ['late_describe', 'late_list', 'late_query'],
    'late: connection() reports every replayed tool as registered',
  )
  assert.deepEqual(late.connection().failed, [], 'late: no failures on replay')

  // Wrapped execute still flows through speech + mirror + log.
  const lateTools = await lateMc.getTools()
  const lateQuery = lateTools.find((t) => t.name === 'late_query')!
  const lateResult = (await lateMc.executeTool(lateQuery, JSON.stringify({ v: 134 }))) as {
    content: { type: string; text: string }[]
  }
  assert.deepEqual(
    lateResult,
    { content: [{ type: 'text', text: 'Maize was K134.' }] },
    'late: replayed tool speaks through the wrapped execute',
  )
  assert.equal(late.log.getSnapshot().at(-1)?.speech, 'Maize was K134.', 'late: execution logged')
  assert.deepEqual(
    lateMirrored.at(-1),
    { kind: 'highlight-range', chartId: 'late-maize', start: '2022-01', end: '2022-01' },
    'late: mirror event flows after replay',
  )

  // Post-connection registrations behave like the always-connected path.
  late.registerGlobal({
    name: 'late_extra',
    description: 'Registered after connection.',
    inputSchema: schema,
    execute: () => ({ speech: 'extra' }),
  })
  await settle()
  assert.ok((await namesOf(lateMc)).includes('late_extra'), 'late: post-connection register works')

  // --- Scenario: NAVIGATOR-ONLY HOST ----------------------------------------
  // Host present only as navigator.modelContext at construction.
  delete (globalThis as { document?: unknown }).document
  const navDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  const navMc = createMockModelContext()
  Object.defineProperty(globalThis, 'navigator', {
    value: { modelContext: navMc },
    configurable: true,
    writable: true,
  })
  try {
    const navReg = createRegistry()
    assert.equal(navReg.isAvailable(), true, 'navigator-only host is detected')
    assert.equal(navReg.connection().state, 'connected', 'navigator host connects at construction')
    assert.equal(navReg.connection().host, 'navigator', 'host reported as navigator')
    navReg.registerGlobal({
      name: 'nav_describe',
      description: 'Describe.',
      inputSchema: schema,
      execute: () => ({ speech: 'Navigator-host description.' }),
    })
    await settle()
    assert.deepEqual(await namesOf(navMc), ['nav_describe'], 'registration works immediately on navigator host')
    assert.deepEqual(navReg.connection().registered, ['nav_describe'], 'navigator registration tracked')
    const navTool = (await navMc.getTools())[0]
    const navResult = (await navMc.executeTool(navTool, '{}')) as {
      content: { type: string; text: string }[]
    }
    assert.equal(navResult.content[0].text, 'Navigator-host description.', 'navigator tool callable')
  } finally {
    if (navDescriptor) Object.defineProperty(globalThis, 'navigator', navDescriptor)
    else Reflect.deleteProperty(globalThis, 'navigator')
  }

  // --- Scenario: NO-SIGNAL HOST (registerTool rejects abort options) --------
  const noSigMc = createMockModelContext({ rejectSignalOption: true })
  ;(globalThis as { document?: unknown }).document = { modelContext: noSigMc }
  const noSig = createRegistry()
  noSig.registerGlobal({
    name: 'ns_describe',
    description: 'Describe.',
    inputSchema: schema,
    execute: () => ({ speech: 'No-signal description.' }),
  })
  await settle()
  assert.deepEqual(
    await namesOf(noSigMc),
    ['ns_describe'],
    'no-signal host: retry without the signal option succeeded',
  )
  assert.deepEqual(noSig.connection().registered, ['ns_describe'], 'no-signal retry tracked as registered')
  assert.deepEqual(noSig.connection().failed, [], 'no-signal retry leaves no failures')

  noSig.registerSurface('ns-a', {
    describe: 'Surface A.',
    tools: [
      {
        name: 'ns_tool_a',
        description: 'A.',
        inputSchema: schema,
        execute: () => ({ speech: 'Tool A speaks.' }),
      },
    ],
  })
  noSig.registerSurface('ns-b', {
    describe: 'Surface B.',
    tools: [
      {
        name: 'ns_tool_b',
        description: 'B.',
        inputSchema: schema,
        execute: () => ({ speech: 'Tool B speaks.' }),
      },
    ],
  })
  noSig.focus('ns-a')
  await settle()
  assert.ok((await namesOf(noSigMc)).includes('ns_tool_a'), 'no-signal host: family A registered')

  // Focus swap: must register the NEW family without throwing; the old family
  // cannot be unregistered on such a host and stays live there.
  noSig.focus('ns-b')
  await settle()
  const noSigNames = await namesOf(noSigMc)
  assert.ok(noSigNames.includes('ns_tool_b'), 'no-signal host: swap registers the new family')
  assert.ok(noSigNames.includes('ns_tool_a'), 'no-signal host: old family remains (no unregistration)')
  assert.deepEqual(noSig.connection().failed, [], 'no-signal swap produces no failures')

  // Swapping back re-encounters already-live names: skipped/treated as
  // success, never a duplicate-registration crash or unhandled rejection.
  noSig.focus('ns-a')
  await settle()
  assert.deepEqual(
    (await namesOf(noSigMc)).sort(),
    ['ns_describe', 'ns_tool_a', 'ns_tool_b'],
    'no-signal host: re-focus does not duplicate already-live tools',
  )
  assert.deepEqual(
    [...noSig.connection().registered].sort(),
    ['ns_describe', 'ns_tool_a', 'ns_tool_b'],
    'no-signal host: all tools tracked as registered',
  )
  assert.deepEqual(noSig.connection().failed, [], 'no-signal re-focus produces no failures')

  const nsTools = await noSigMc.getTools()
  const nsB = nsTools.find((t) => t.name === 'ns_tool_b')!
  const nsResult = (await noSigMc.executeTool(nsB, '{}')) as {
    content: { type: string; text: string }[]
  }
  assert.equal(nsResult.content[0].text, 'Tool B speaks.', 'no-signal host: tools callable')

  delete (globalThis as { document?: unknown }).document

  console.log('ok — all agent-a11y registry assertions passed')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
