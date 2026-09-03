/**
 * Rail.check.tsx — server-rendered regression check for the first-run rail.
 *
 * The rail must never present a form that only echoes a question. Without a
 * WebMCP host it should explain that Site Tools are unavailable; with the
 * normal server snapshot it must remain honest and actionable.
 *
 * Run:  npx tsx src/rail/Rail.check.tsx
 */

import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Rail } from './Rail.tsx'

const html = renderToStaticMarkup(createElement(Rail))

assert.doesNotMatch(html, /<form\b/, 'rail must not render the former display-only Ask form')
assert.match(html, /Site Tools unavailable/, 'rail reports missing WebMCP support')
assert.match(html, /Ask Codex/, 'rail explains that the browser agent owns the conversation')

console.log('ok — rail first-run state is truthful, actionable, and contains no inert Ask form')
