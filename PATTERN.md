# The Agent-Accessibility Grammar

*A convention for making WebMCP sites usable by everyone — proposed by [Auricle](./README.md).*

---

## The web already made this mistake once

HTML gave pages structure, but structure alone does not guarantee accessibility — a `<div>` soup
can render fine while exposing little useful meaning to assistive technology. Semantic HTML,
platform accessibility APIs, and conventions including ARIA now provide a richer accessibility
layer, but the web still carries the cost of treating that work as an afterthought.

**WebMCP is at its pre-ARIA moment.** The spec lets a page expose tools to an agent. That is
all it guarantees. Nothing in it requires those tools to orient or serve the *person* who is
driving the agent. A site can be fully WebMCP-enabled and still be inaccessible.

So WebMCP is not the accessibility solution. **WebMCP is the wiring. The solution is the
convention we lay on top of it — and it is still being shaped.** Auricle demonstrates and
proposes one such convention; this document is an invitation to test and improve it.

The opportunity is timing. The original web got its accessibility grammar decades too late.
WebMCP is young enough to get it right **while the standard is still wet cement.**

---

## The five rules

Each rule is a design constraint on the tools a page registers. Auricle's reusable
implementation lives in [`src/lib/agent-a11y/`](./src/lib/agent-a11y/) (~350 lines, framework-agnostic,
a safe no-op when WebMCP is absent).

### 1. Orientation before action

Every surface answers "where am I, and what can I do here?" before it offers actions. A screen
reader user's first question is never "what's the price of maize" — it's "what is this page."

```js
registry.registerGlobal({
  name: 'describe_screen',
  description: 'Start here. Describes the dashboard and every chart’s headline figure, and what to focus next.',
  inputSchema: { type: 'object', properties: {} },
  execute: () => ({ speech: 'Auricle shows four Zambian open-data charts you query in plain language…' }),
})
```

Orientation tools are **always registered** — they never disappear. In Auricle they are
`describe_screen`, `list_visualizations`, and `focus_chart`.

### 2. Tools follow focus

A screen reader has exactly **one focus at a time.** That is not a limitation to route around —
it is the interaction model that makes non-visual navigation tractable. The agent-facing tool
surface should mirror it: the tools available are scoped to where the user's attention is.

In Auricle, each chart owns a *family* of query tools that registers when the chart is focused
and **unregisters** when focus moves — via one `AbortController` per family. Focus `maize-prices`
and the agent gains `query_range`, `find_extremes`, `sonify`; focus another chart and those
vanish, replaced by that chart's family. This keeps the agent's choices small, relevant, and
legible — and it exercises WebMCP's dynamic register/unregister, which most sites never touch.

> Why not just register 20 tools with a `chart_id` parameter? Because focus is the semantic. A
> flat tool list has no notion of "where the user is"; the focus model encodes it, so the agent
> is scoped the same way a screen reader user is.

### 3. Narratable returns

Every tool result is a **speakable sentence with the exact figure**, not JSON for a UI to
render. The result *is* the answer, because for a blind user there is no glance at a tooltip to
supplement it.

```
query_range(2022-01 … 2025-01)
→ "From Jan 2022 to Jan 2025, maize meal went 4.76 → 12.11 ZMW/kg, up 154.4%
   (WFP retail prices via HDX). Ask find_extremes for the all-time peak."
```

Figure, unit, source, and a steering next-step — every time. The steering suffix is part of this
rule: results end by suggesting what to ask next, so a non-visual user is not stranded wondering
what is possible.

### 4. Visual mirroring

Every tool call **paints on screen** what it just answered. This is not for the blind user — it
is for the *shared surface*. When a sighted teacher, colleague, or family member is in the room,
they see the same conversation: ask "when did maize spike," and the gold band lands on the exact
range on the chart while the agent speaks the number. The blind user and the sighted user are
looking at one artifact, not two disconnected tools.

Auricle mirrors via a small event bus: each tool returns an optional `mirror` event
(`highlight-range`, `highlight-point`, `bar-emphasis`, `scatter-ring`, `sonify`) that the focused
chart renders and auto-clears. A separate API or chatbot could reproduce pieces of this, but
page-owned tools provide a direct, portable contract between the live page state, the agent's
answer, and the visual response.

### 5. Non-visual encodings as first-class tools

The chart is not the only way to convey shape. Auricle's `sonify` tool plays a series as a
~3-second pitch sweep (220–880 Hz), with a louder octave ping at the true peak — so a blind user
*hears* the shape of a decade in three seconds and knows exactly where the maximum falls. Data
tables, sonification, and haptics are not fallbacks bolted beside the chart; they are tools the
agent can call, ranked equal to the visual.

This is the rule that turns "accessible" from a compliance checkbox into a capability the
sighted user might envy.

---

## Why WebMCP is the right interface

The sharpest test of genuine WebMCP leverage is not whether the idea is technically impossible by
other means. It is whether the page-agent contract makes the experience more direct, portable,
and trustworthy. For Auricle, it does:

- **Rules 3 + 4** keep the answer and on-screen paint tied to the *same page state in the same
  session*, instead of requiring a separate integration to coordinate them.
- **Rule 2** expresses changing attention directly: register/unregister on the live
  `document.modelContext` makes the available tool surface follow focus.
- Auricle's answers come from the page's own data arrays rather than visual estimation, and its
  live feed's `session_stats` reports state that exists only in this browsing session. The page is
  the source of truth and tells the agent instead of making the agent infer the data from pixels.

That is the accessibility inversion at the heart of the grammar: **the site becomes
self-describing, instead of relying on the agent to guess.**

---

## Honest limits

- **This is a pattern proposal, not a validated product.** Auricle was built by sighted developers
  and has **not** been tested with blind or low-vision users. Treat the five rules as a starting
  point for that community to shape, not a finished standard. Contributions and correction are the
  point.
- **Prior art exists and is cited, not claimed.** Sonification is not new — see Apple's Audio
  Graphs and Highcharts' sonification module. The contribution here is *framing these as WebMCP
  tools under a shared grammar*, not inventing them. Auricle also ships a plain data-table toggle
  on every chart (WCAG 1.1.1's floor); the interrogation and sonification are the ceiling above it.
- **The convention needs the ecosystem.** One dashboard proves the shape. The grammar only matters
  if other sites adopt it — which is why the implementation is a small, extractable library and
  this document is written to be lifted, argued with, and improved.

---

*Auricle is open source (MIT). The grammar above is free to adopt, adapt, and better.*
