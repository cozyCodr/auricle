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
implementation lives in [`src/lib/agent-a11y/`](./src/lib/agent-a11y/) (~365 lines,
framework-agnostic, a safe no-op when WebMCP is absent). Every snippet below is lifted from
the shipped source.

### 1. Orientation before action

Every surface answers "where am I, and what can I do here?" before it offers actions. A screen
reader user's first question is never "how hot was 1998" — it's "what is this page." Auricle's
`describe_screen` narrates whichever state the workspace is in — the raw shelf, or the live
views with their real headline figures — and steers the next call
([`src/dashboard/orientation.ts`](./src/dashboard/orientation.ts)):

```ts
const describeScreen: ToolDef = {
  name: 'describe_screen',
  description:
    'Start here. Describes what is on screen right now: on first load, the raw ' +
    'data shelf (four real climate tables, no charts) and how to commission a ' +
    'view; once views exist, each live view with its real headline figure. ' +
    'Steers your next call (create_view on the shelf; a view’s tools after).',
  inputSchema: EMPTY_OBJECT_SCHEMA,
  execute: () => { /* …narrates shelf or workspace, always with real figures */ },
}
```

Orientation tools are **always registered** — they never disappear. In Auricle they are
`describe_screen`, `list_visualizations`, `create_view`, `clear_workspace`, and `focus_chart`.

### 2. Tools follow focus

A screen reader has exactly **one focus at a time.** That is not a limitation to route around —
it is the interaction model that makes non-visual navigation tractable. The agent-facing tool
surface should mirror it: the tools available are scoped to where the user's attention is.

In Auricle, each commissioned dataset owns a *family* of query tools that registers when the
view is focused and **unregisters** when focus moves — via one `AbortController` per family
([`src/lib/agent-a11y/registry.ts`](./src/lib/agent-a11y/registry.ts)):

```ts
focus(surfaceId: string): void {
  if (this.focusedId === surfaceId) return // idempotent re-focus
  const surface = this.surfaces.get(surfaceId)
  if (!surface) return
  this.blur() // unregister the previously focused family
  this.focusCtl = new AbortController()
  this.focusedId = surfaceId
  for (const tool of surface.tools) this.register(tool, this.focusCtl.signal)
}

blur(): void {
  if (this.focusCtl) {
    this.focusCtl.abort() // unregisters every tool in the family
    this.focusCtl = null
  }
  this.focusedId = null
}
```

Focus `temp-anomaly` and the agent gains `query_point`, `query_range`, `find_extremes`,
`describe_trend`, `sonify`; focus the emissions chart and those vanish, replaced by that
family. This keeps the agent's choices small, relevant, and legible — and it exercises
WebMCP's dynamic register/unregister, which most sites never touch.

> Why not just register 21 tools with a `chart_id` parameter? Because focus is the semantic. A
> flat tool list has no notion of "where the user is"; the focus model encodes it, so the agent
> is scoped the same way a screen reader user is.

### 3. Narratable returns

Every tool result is a **speakable sentence with the exact figure**, not JSON for a UI to
render. The result *is* the answer, because for a blind user there is no glance at a tooltip to
supplement it. The library encodes this as its return type
([`src/lib/agent-a11y/registry.ts`](./src/lib/agent-a11y/registry.ts)):

```ts
/**
 * A tool result that is *narratable*: a human-speakable sentence with exact
 * figures, optional structured data, and an optional page-mirroring event.
 */
export interface NarratedResult {
  /** A speakable sentence, e.g. "Maize rose 41% from K95 to K134." */
  speech: string
  /** Optional structured payload for programmatic consumers. */
  data?: unknown
  /** Optional event dispatched on the mirror bus so the page reacts. */
  mirror?: MirrorEvent
}
```

In practice:

```
temp-anomaly_find_extremes()
→ "Over 1880–2025, the coldest year was 1909 at −0.49 °C and the warmest was 2024
   at +1.28 °C — the warmest year in the entire instrumental record (NASA GISTEMP v4,
   vs 1951–1980). You can ask describe_trend for the full shape, or query_range for a change."
```

Figure, unit, source, and a steering next-step — every time. The steering suffix is part of
this rule: results end by suggesting what to ask next, so a non-visual user is not stranded
wondering what is possible.

### 4. Visual mirroring

Every tool call **paints on screen** what it just answered. This is not for the blind user — it
is for the *shared surface*. When a sighted teacher, colleague, or family member is in the room,
they see the same conversation: ask "when was the hottest year," and the gold glow lands on 2024
while the agent speaks the number. The blind user and the sighted user are looking at one
artifact, not two disconnected tools.

Auricle mirrors via a small event bus ([`src/lib/agent-a11y/mirror.ts`](./src/lib/agent-a11y/mirror.ts)):

```ts
/** Minimal synchronous pub/sub. `subscribe` returns an unsubscribe function. */
export class MirrorBus {
  private readonly handlers = new Set<MirrorHandler>()

  subscribe(handler: MirrorHandler): () => void {
    this.handlers.add(handler)
    return () => {
      this.handlers.delete(handler)
    }
  }

  emit(event: MirrorEvent): void {
    for (const handler of this.handlers) handler(event)
  }
}
```

Each tool returns an optional `mirror` event (`highlight-range`, `highlight-point`,
`bar-emphasis`, `scatter-ring`, `sonify`, `view-created`, …) that fans out to **every view of
that dataset on screen** — commission the warming curve as a line *and* as stripes, and a
`query_range` answer highlights both at once. Same data, two shapes, one answer.

### 5. Non-visual encodings as first-class tools

The chart is not the only way to convey shape. Auricle's `sonify` tool plays a series as a
~3-second pitch sweep (220–880 Hz), with a louder octave ping at the true peak — so a blind
user *hears* 146 years of warming in three seconds and knows exactly where the record falls
([`src/dashboard/surfaces.ts`](./src/dashboard/surfaces.ts)):

```ts
sonifyTool('temp-anomaly', {
  values: pts.map((p) => p.y),
  period: `${first.x}–${last.x}`,
  peakWithUnit: `${fmtAnomaly(peak.y)} °C`,
  peakLabel: String(peak.x),
  peakCaveat: 'Here the rising pitch IS the warming — the sweep ends near its highest tones.',
}),
```

Data tables, sonification, and haptics are not fallbacks bolted beside the chart; they are
tools the agent can call, ranked equal to the visual. This is the rule that turns "accessible"
from a compliance checkbox into a capability the sighted user might envy.

---

## The sixth move: views born from questions

The five rules govern tools on surfaces that exist. Auricle extends the grammar one step:
**composition itself is a tool.** The page boots as a raw data shelf — accessible tables,
zero charts, zero chart tools — and the global `create_view` commissions each view, at which
moment its tool family **registers into existence at runtime**
([`src/dashboard/workspace.ts`](./src/dashboard/workspace.ts)):

```ts
const familyBorn = !isCommissioned(chartId)
if (familyBorn) {
  const surface = buildSurface(chartId)
  if (!surface) return null
  registry.registerSurface(chartId, surface) // the surface is born HERE, once per dataset
}
const view: WorkspaceView = { chartId, kind: resolvedKind }
views = [...views, view]
setFocus(chartId) // registers/keeps the family + reflows the UI
```

Why does composition belong in an *accessibility* grammar? Because a fixed dashboard is a
sighted designer's guess at what matters. When the workspace is shaped by asking — *"show me
warming over time," "now as stripes," "rank the emitters," "just give me the number"* — the
user builds the space to fit their own needs, visual or not. The same dataset coexists as
multiple kinds (a line **and** queryable warming stripes); re-rendering is just another
`create_view` call; `clear_workspace` tears every family back down to the shelf. A view's tool
family lives exactly as long as the view it serves — the tool surface never advertises
capabilities the screen does not have. And the on-page fallback form drives the identical
handlers through `registry.executeLocal`, so agent and no-agent users compose the same way.

---

## Why WebMCP is the right interface

The sharpest test of genuine WebMCP leverage is not whether the idea is technically impossible
by other means. It is whether the page-agent contract makes the experience more direct,
portable, and trustworthy. For Auricle, it does:

- **Rules 3 + 4** keep the answer and on-screen paint tied to the *same page state in the same
  session*, instead of requiring a separate integration to coordinate them.
- **Rule 2 and the sixth move** express changing attention and changing structure directly:
  register/unregister on the live `document.modelContext` makes the available tool surface
  follow both focus and composition — `getTools()` is a live map of the screen.
- Auricle's answers come from the page's own data arrays rather than visual estimation, and
  the live CO₂ feed's `session_stats` reports tick state that exists only in this browsing
  session (its family re-registers per tick, so even tool *descriptions* carry live state).
  The page is the source of truth and tells the agent, instead of making the agent infer the
  data from pixels.

That is the accessibility inversion at the heart of the grammar: **the site becomes
self-describing, instead of relying on the agent to guess.**

---

## Honest limits

- **This is a pattern proposal, not a validated product.** Auricle was built by sighted
  developers and has **not** been tested with blind or low-vision users. Treat these rules as
  a starting point for that community to shape, not a finished standard. Contributions and
  correction are the point.
- **Prior art exists and is cited, not claimed.** Sonification is not new — see Apple's Audio
  Graphs and Highcharts' sonification module. The warming stripes are Ed Hawkins' design
  (#ShowYourStripes); Auricle's contribution is making them *queryable*, not inventing them.
  The contribution overall is *framing these as WebMCP tools under a shared grammar*. Auricle
  also keeps a plain source-cited data table behind every dataset (WCAG 1.1.1's floor); the
  interrogation, composition, and sonification are the ceiling above it.
- **The convention needs the ecosystem.** One dashboard proves the shape. The grammar only
  matters if other sites adopt it — which is why the implementation is a small, extractable
  library and this document is written to be lifted, argued with, and improved.

---

*Auricle is open source (MIT). The grammar above is free to adopt, adapt, and better.*
