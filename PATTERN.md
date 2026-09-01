# The Agent-Accessibility Grammar

*A convention for making WebMCP sites usable by everyone — proposed by [Auricle](./README.md).*

---

## The web already made this mistake once

HTML gave pages structure. It did **not** make them accessible — a `<div>` soup renders
fine and is unusable with a screen reader. Accessibility came later, bolted on, through a
*convention layered on top*: **ARIA**. ARIA is the grammar that says "here is how you expose
your structure so assistive technology can consume it." We are still, twenty-five years
later, paying for the gap between HTML shipping and that convention maturing.

**WebMCP is at its pre-ARIA moment.** The spec lets a page expose tools to an agent. That is
all it guarantees. Nothing in it requires those tools to be usable by a *person* who is
driving the agent — and the evidence is already in: of the ~450 sites in the public WebMCP
directory, the tools are overwhelmingly `add_to_cart` / `checkout` / `search_products`. A
site can be fully WebMCP-enabled and completely useless to a blind user.

So WebMCP is not the accessibility solution. **WebMCP is the wiring. The solution is the
convention we lay on top of it — and it doesn't exist yet.** Auricle is one demonstration of
that convention. This document is the convention itself.

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

Figure, unit, source, and a steering next-step — every time. (Rule 6 below is that steering
suffix: results end by suggesting what to ask next, so a non-visual user is never stranded
wondering what's possible.)

### 4. Visual mirroring

Every tool call **paints on screen** what it just answered. This is not for the blind user — it
is for the *shared surface*. When a sighted teacher, colleague, or family member is in the room,
they see the same conversation: ask "when did maize spike," and the gold band lands on the exact
range on the chart while the agent speaks the number. The blind user and the sighted user are
looking at one artifact, not two disconnected tools.

Auricle mirrors via a small event bus: each tool returns an optional `mirror` event
(`highlight-range`, `highlight-point`, `bar-emphasis`, `scatter-ring`, `sonify`) that the focused
chart renders and auto-clears. A REST API has no surface for this; a chatbot answers in a
separate window. Only a page that owns its own tools can keep the human's view and the agent's
answer in sync.

### 5. Non-visual encodings as first-class tools

The chart is not the only way to convey shape. Auricle's `sonify` tool plays a series as a
~3-second pitch sweep (220–880 Hz), with a louder octave ping at the true peak — so a blind user
*hears* the shape of a decade in three seconds and knows exactly where the maximum falls. Data
tables, sonification, and haptics are not fallbacks bolted beside the chart; they are tools the
agent can call, ranked equal to the visual.

This is the rule that turns "accessible" from a compliance checkbox into a capability the
sighted user might envy.

---

## Why this can't be faked without WebMCP

The sharpest test of "genuine WebMCP leverage" is: *would this work as a chatbot with the CSV, or
as a REST API?* For a self-describing accessible page, no — and precisely because of the grammar:

- **Rule 3 + 4** require the answer and the on-screen paint to originate from the *same page state
  in the same session.* A chatbot answers elsewhere; an API can't highlight the chart.
- **Rule 2**'s focus model is register/unregister on a live `document.modelContext` — there is no
  REST equivalent of "the tools change as attention moves."
- The values themselves are **unknowable offline**: Auricle's answers come from the page's own
  data arrays (not vision-OCR of chart pixels, which agents misread), and its live feed's
  `session_stats` reports state that exists *only in this browsing session* — "no offline model or
  dataset has them." The page is the sole source of truth, and it *tells* the agent, rather than
  the agent guessing.

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
