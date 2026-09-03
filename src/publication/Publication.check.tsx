/**
 * Publication.check.tsx — server-rendered regression check for the
 * "normal website with a secret" resting state.
 *
 * Asserts the publication truly is a publication (deep accessible tables,
 * NO chat/rail/form/mic chrome, no commissioning buttons on the cards), that
 * the slim colophon carries the "Enable sound" control + sources line, and —
 * the accessibility thesis — that the visually-hidden `aria-live` region
 * receives every executed tool's narrated speech through the registry's
 * shared execution path.
 *
 * Run:  npx tsx --tsconfig tsconfig.app.json src/publication/Publication.check.tsx
 */

import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Publication, ToolSpeechAnnouncer, Colophon } from './Publication.tsx'
import { registerDashboard } from '../dashboard'
import { registry } from '../lib/agent-a11y'
import { TOTAL_ROWS, rowCountFor } from '../charts/data.ts'

// --- 1. The publication state: cards + deep tables, ZERO agent chrome -------

const pub = renderToStaticMarkup(createElement(Publication))

// The honest headline, with the REAL total row count.
assert.match(
  pub,
  new RegExp(`${TOTAL_ROWS.toLocaleString('en-US')} rows\\. Zero answers\\.`),
  'headline carries the real total row count',
)
assert.ok(TOTAL_ROWS >= 2000, `dataset is deep (${TOTAL_ROWS} rows total)`)
assert.ok(rowCountFor('co2-emitters') >= 1500, 'emitters table holds 1,500+ per-country-per-year rows')

// Four dataset cards with serif titles + sources.
for (const title of [
  'Global temperature anomaly',
  'CO₂ emissions by country',
  'Wealth vs carbon',
  'CO₂ at Mauna Loa',
]) {
  assert.ok(pub.includes(title), `publication card present: ${title}`)
}
for (const src of ['NASA GISS', 'Our World in Data', 'NOAA']) {
  assert.ok(pub.includes(src), `source line names ${src}`)
}

// Deep REAL tables: four <table>s with captions and scoped headers.
assert.equal((pub.match(/<table\b/g) ?? []).length, 4, 'four real <table> elements')
assert.equal((pub.match(/<caption\b/g) ?? []).length, 4, 'each table keeps its <caption>')
assert.ok(/scope="col"/.test(pub) && /scope="row"/.test(pub), 'th scope attributes intact')

// NO agent chrome and NO commissioning affordances: to a human, a publication.
assert.doesNotMatch(pub, /<form\b/, 'no direct-ask form')
assert.doesNotMatch(pub, /<input\b/, 'no text input')
assert.doesNotMatch(pub, /<button\b/, 'no buttons on the cards — commissioning is the agent’s secret')
assert.doesNotMatch(pub, /rail-|rail__/, 'no rail classes')
assert.doesNotMatch(pub, /Ask Auricle directly|Site Tools|Ask by voice|Listening/, 'no chat/mic copy')
assert.doesNotMatch(pub, /aria-live/, 'the live region lives outside the cards (zero pixels, app-level)')

// --- 2. The colophon: Enable sound + sources, nothing else ------------------

const foot = renderToStaticMarkup(createElement(Colophon))
assert.match(foot, /<footer\b/, 'colophon is a real footer')
assert.ok(foot.includes('Enable sound'), 'colophon carries the Enable sound text control')
assert.ok(
  foot.includes('Data: NASA GISTEMP · NOAA · Our World in Data'),
  'colophon carries the sources line',
)

// --- 3. The sr-only live region receives executed tool speech ---------------

// Before any tool runs: present, polite, empty.
const before = renderToStaticMarkup(createElement(ToolSpeechAnnouncer))
assert.match(before, /aria-live="polite"/, 'live region is aria-live=polite')
assert.match(before, /class="sr-only"/, 'live region is visually hidden')

// Execute a REAL registered global through the registry's shared path (the
// same path WebMCP hosts hit) and assert its speech lands in the region.
registerDashboard()
const executed = await registry.executeLocal('describe_screen', {})
assert.equal(executed, true, 'describe_screen executes without a WebMCP host')
const speech = registry.log.getSnapshot().at(-1)?.speech ?? ''
assert.ok(speech.includes('Auricle'), 'describe_screen onboards with the publication framing')
assert.ok(speech.includes('publication'), 'describe_screen speech says publication')
assert.ok(
  speech.includes(`${TOTAL_ROWS.toLocaleString('en-US')} rows`),
  'describe_screen speech carries the real total row count',
)

const after = renderToStaticMarkup(createElement(ToolSpeechAnnouncer))
assert.ok(
  after.includes('Zero answers'),
  'the sr-only live region renders the executed tool’s speech',
)

console.log(
  `ok — publication state: ${TOTAL_ROWS.toLocaleString('en-US')} real rows across four deep tables, ` +
    'zero agent chrome (no form/rail/mic/buttons), colophon has Enable sound + sources, and the ' +
    'visually-hidden aria-live region receives every executed tool’s speech.',
)
