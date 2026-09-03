/** Regression checks for truthful local-intent execution status. */

import assert from 'node:assert/strict'
import { registry } from './lib/agent-a11y/registry.ts'
import { runIntent, runLocalIntent } from './voice/intents.ts'

type FakeTool = { name: string }
type FakeModelContext = {
  getTools?: () => Promise<FakeTool[]>
  executeTool?: (tool: FakeTool, args: unknown) => Promise<unknown>
}

function installModelContext(value?: FakeModelContext): void {
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: value ? { modelContext: value } : undefined,
  })
}

// On the shelf (empty workspace), "what's the peak" plans
// create_view(temp-anomaly) → temp-anomaly_find_extremes.
installModelContext()
const unavailable = await runIntent("what's the peak")
assert.equal(unavailable.executed, false)
assert.equal(unavailable.failure, 'webmcp-unavailable')

installModelContext({ getTools: async () => [] })
const unsupported = await runIntent("what's the peak")
assert.equal(unsupported.executed, false)
assert.equal(unsupported.failure, 'execute-unsupported')

installModelContext({
  getTools: async () => [],
  executeTool: async () => undefined,
})
const missing = await runIntent("what's the peak")
assert.equal(missing.executed, false)
assert.equal(missing.failure, 'tool-not-found')

const calls: Array<{ tool: string; args: string }> = []
installModelContext({
  getTools: async () => [{ name: 'create_view' }, { name: 'temp-anomaly_find_extremes' }],
  executeTool: async (tool, args) => {
    if (typeof args !== 'string') throw new TypeError('legacy host requires JSON string')
    calls.push({ tool: tool.name, args })
  },
})
const success = await runIntent("what's the peak")
assert.equal(success.executed, true)
assert.equal(success.failure, undefined)
assert.deepEqual(calls, [
  { tool: 'create_view', args: '{"dataset":"temp-anomaly"}' },
  { tool: 'temp-anomaly_find_extremes', args: '{}' },
])

Reflect.deleteProperty(globalThis, 'document')
registry.registerGlobal({
  name: 'describe_screen',
  description: 'Describe the dashboard.',
  inputSchema: { type: 'object', properties: {} },
  execute: () => ({ speech: 'Local dashboard description.' }),
})
const local = await runLocalIntent('describe the screen')
assert.equal(local.executed, true)
assert.equal(registry.log.getSnapshot().at(-1)?.speech, 'Local dashboard description.')

console.log('ok — voice runners report host failures truthfully and local execution reuses the registry pipeline')
