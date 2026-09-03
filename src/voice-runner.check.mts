/** Regression checks for truthful local-intent execution status. */

import assert from 'node:assert/strict'
import { runIntent } from './voice/intents.ts'

type FakeTool = { name: string }
type FakeModelContext = {
  getTools?: () => Promise<FakeTool[]>
  executeTool?: (tool: FakeTool, args: string) => Promise<unknown>
}

function installModelContext(value?: FakeModelContext): void {
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: value ? { modelContext: value } : undefined,
  })
}

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
  getTools: async () => [{ name: 'maize-prices_find_extremes' }],
  executeTool: async (tool, args) => {
    calls.push({ tool: tool.name, args })
  },
})
const success = await runIntent("what's the peak")
assert.equal(success.executed, true)
assert.equal(success.failure, undefined)
assert.deepEqual(calls, [{ tool: 'maize-prices_find_extremes', args: '{}' }])

Reflect.deleteProperty(globalThis, 'document')
console.log('ok — voice runner reports unavailable, unsupported, missing-tool, and successful execution truthfully')
