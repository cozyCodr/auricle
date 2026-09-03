/**
 * Rail.check.tsx — server-rendered regression check for the first-run rail.
 *
 * The rail's form must execute tools rather than merely echoing a question.
 * Without a WebMCP host it remains usable through the shared local execution
 * path while the Site Tools status still explains agent availability.
 *
 * Run:  npx tsx src/rail/Rail.check.tsx
 */

import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Rail } from './Rail.tsx'

const html = renderToStaticMarkup(createElement(Rail))

assert.match(html, /<form\b/, 'rail provides a direct typed rehearsal')
assert.match(html, /Ask Auricle directly/, 'direct input has an explicit label')
assert.doesNotMatch(html, /<input[^>]+disabled/, 'direct input works without a WebMCP host')
assert.match(html, /Site Tools unavailable/, 'rail reports missing WebMCP support')
assert.match(html, /Ask Codex/, 'rail explains that the browser agent owns the conversation')

console.log('ok — rail first-run state is truthful and its typed rehearsal remains usable without a WebMCP host')
