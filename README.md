# Auricle — the dashboard you can interview

**A data dashboard a blind person can use — by talking to their browser's AI agent.**

Canvas and SVG charts are assistive technology's black hole: a screen reader hits one and says
*"image."* Dead end. Auricle fixes that not by describing the picture, but by making the page
**self-describing to an agent**: every chart registers [WebMCP](https://github.com/webmachinelearning/webmcp)
tools that answer questions from the page's own data model — exact values, ranges, extremes,
correlations — and **sonify** a decade into a three-second tone so you can *hear* where the peak
falls. Every answer is spoken with the real figure and its source, and paints the chart in sync,
so a blind user and a sighted one are looking at the same conversation.

The data is real: Zambian open-data indicators (maize-meal prices, under-5 mortality,
cereal-yield, ZMW/USD) fetched from the World Bank, WFP/HDX, and a keyless FX API.

> Auricle is a demonstration of a reusable idea — the **[agent-accessibility grammar](./PATTERN.md)**:
> five rules for making *any* WebMCP site usable, not just agent-operable. WebMCP is the wiring;
> the grammar is the accessibility. See **[PATTERN.md](./PATTERN.md)**.

## How it uses WebMCP

Every chart's capability is a registered tool. This is the whole product — strip WebMCP out and
there is no Auricle:

```js
document.modelContext.registerTool({
  name: "maize-prices_query_range",
  description: "Compare the maize price across a date range (start, end as YYYY-MM). " +
    "Returns start/end values, percent change, and the min & max within the window.",
  inputSchema: {
    type: "object",
    properties: {
      start: { type: "string", description: 'Start month "YYYY-MM".' },
      end:   { type: "string", description: 'End month "YYYY-MM".' },
    },
    required: ["start", "end"],
  },
  execute: async ({ start, end }) => ({
    // answers from the page's own data arrays — not vision-OCR of pixels
    content: [{ type: "text", text: "From Jan 2022 to Jan 2025, maize meal went 4.76 → 12.11 ZMW/kg, up 154.4%…" }],
  }),
}, { signal });
```

The tools follow the user's **focus**: a global orientation set (`describe_screen`,
`list_visualizations`, `focus_chart`) is always registered, and each chart's query family
registers only while that chart is focused and unregisters when focus moves — mirroring how a
screen reader has one focus at a time. The live ZMW/USD feed even **re-registers `current_value`
on every tick**, so `getTools()` visibly changes over the session, and `session_stats` reports
state that exists only in your browser session.

## Architecture

```
src/
  lib/agent-a11y/   ← THE REUSABLE LIBRARY (the extractable idea; framework-agnostic)
    registry.ts       focus-model tool registry: always-on globals + per-surface families
    mirror.ts         event bus — tools paint the chart
    log.ts            ring buffer — the plain-words tool-call log
    react.ts          useSurface / useToolLog / useMirror / useAgentAvailable
  dashboard/        ← chart metadata (headlines computed from real data), orientation tools,
                      per-chart tool families, the live-feed session store
  charts/           ← hand-rolled SVG: LineChart, BarChart, ScatterChart, LiveFeed,
                      DataTable (WCAG-1.1.1 floor), the mirror→highlight layer
  rail/             ← the conversation rail (question, answer, tool-call log as an aria-live region)
  sonify.ts         ← Web Audio pitch-mapped sonification (rule 5)
  voice.ts          ← in-page Web Speech input (the accessibility input modality)
  data/             ← real indicators baked to JSON at build time (+ scripts/fetch-data.ts)
```

No backend. The app renders and stays fully usable when `document.modelContext` is absent (the
WebMCP tools simply don't register).

## The two ways to drive it

1. **An external WebMCP agent** — the primary path. Open Auricle in ChatGPT's browser (Atlas) or
   Chrome with WebMCP enabled, and ask your agent to describe the screen, focus a chart, find the
   peak, or play it as sound. The agent calls the registered tools.
2. **In-page voice** — the accessibility input modality and a standalone demo: click *Ask by
   voice*, speak, and a small rehearsed-phrase matcher drives the *same* WebMCP tools locally so
   the full loop runs without an external agent.

## Run it locally

```sh
npm install
npm run fetch-data   # refresh the baked JSON from live sources (optional — data is committed)
npm run dev          # http://localhost:5173
npm run build        # type-check + production build
```

**To see the WebMCP tools work**, use Chrome **149+** with the flag on:

1. `chrome://flags/#enable-webmcp-testing` → **Enabled** → relaunch.
2. Open Auricle. `document.modelContext` is now present; the tools register.
3. Drive them with an agent, the *Ask by voice* button, or the
   [Model Context Tool Inspector](https://chromewebstore.google.com/) extension.

Click **♪ Enable sound** once (browsers only start audio from a gesture) to hear the sonifier.

## Data & sources

All figures are real and fetched by [`scripts/fetch-data.ts`](./scripts/fetch-data.ts); see
[`src/data/README.md`](./src/data/README.md) for what each series actually shows.

- **Maize-meal retail price** — WFP, via [HDX](https://data.humdata.org/) (25kg-bag readings
  normalized to per-kg; the real 2022–23 methodology gap is preserved, not interpolated)
- **Under-5 mortality**, **cereal yield**, **fertilizer** — [World Bank Open Data](https://data.worldbank.org/)
- **ZMW/USD** — fawazahmed0 currency-api (real daily closes; the runtime "live" ticks are a
  clearly-labelled bounded simulation seeded from the last real close)

## Accessibility

Auricle is itself built to be accessible: semantic landmarks and headings, `role="img"` +
real-figure `aria-label` on every chart, a source-cited data-table toggle on each, the tool-call
log as an `aria-live` region, keyboard-operable controls, and `prefers-reduced-motion` respected.
It has **not** yet been tested with blind or low-vision users — see the honest limits in
[PATTERN.md](./PATTERN.md); feedback from that community is the point.

## License

[MIT](./LICENSE) — © 2026 Auricle contributors. The [grammar](./PATTERN.md) is free to adopt and improve.
