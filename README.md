# Auricle — interview the planet

**A climate dashboard that builds itself from your questions, designed so blind and sighted people explore the same evidence together through a browser agent.**

**A normal website with a secret.** To a visitor, Auricle is a climate-data
publication: four real datasets (NASA GISTEMP, Our World in Data, NOAA Mauna Loa) as deep,
scrollable tables — *"2,026 rows. Zero answers."* Tables are what a screen reader can
already read: accessible, but unanswerable. To an agent, the same page is a **workbench**:
[WebMCP](https://webmachinelearning.github.io/webmcp/) tools that compute statistics from
the page's own data, draw chart views onto the canvas, highlight answers, and play any
series as sound. **The website has no chat box. Watch it answer.** The agent does the
talking in its own chat (every tool returns a narrated sentence with the exact figure);
the page answers *spatially* — charts materialize, highlights land, a century of warming
plays as a rising tone with a ping on the 2024 record. And the site onboards the agent
itself, over WebMCP: no SDK, no docs page, no integration — an agent walks in, calls
`describe_screen`, and knows what it can do for its user.
**Every chart on this screen exists because someone asked.**

**Live:** [auricle-khaki.vercel.app](https://auricle-khaki.vercel.app) · **The thesis:** [PATTERN.md](./PATTERN.md)

## How it uses WebMCP

Every capability is a registered tool. Strip WebMCP out and there is no Auricle. This is the
real global `create_view` tool (from [`src/dashboard/orientation.ts`](./src/dashboard/orientation.ts),
wrapped for `document.modelContext.registerTool` by
[`src/lib/agent-a11y/registry.ts`](./src/lib/agent-a11y/registry.ts)):

```js
document.modelContext.registerTool({
  name: "create_view",
  description:
    "Draw a new view onto the canvas for your user: the chart materializes on the " +
    "page (9 kinds across the datasets) and its tool family registers at that " +
    "moment — each view you create brings its own tools online, so your action " +
    "space grows. The SAME dataset can be drawn as multiple kinds at once (e.g. " +
    "temp-anomaly as a line AND as stripes) — idempotent per (dataset, kind) pair. " +
    "Kinds per dataset: temp-anomaly [line, area, stripes, stat] · " +
    "co2-emitters [bar, hbar, share, stat] · wealth-carbon [scatter, stat] · " +
    "co2-live [live, stat].",
  inputSchema: {
    type: "object",
    properties: {
      dataset: { type: "string", enum: ["temp-anomaly", "co2-emitters", "wealth-carbon", "co2-live"] },
      kind:    { type: "string", description: "Optional chart kind; defaults to the dataset's canonical form." },
    },
    required: ["dataset"],
  },
  execute: async ({ dataset, kind }) => ({
    // commissions the view, registers its tool family, focuses it — then narrates:
    content: [{ type: "text", text:
      "Built you the warming curve as a line — 146 rows of it. Its 5 tools just came " +
      "online: temp-anomaly_query_point, query_range, find_extremes, describe_trend, " +
      "sonify. Record +1.28 °C in 2024. It is focused and ready to interview." }],
  }),
}, { signal });
```

## The arc

1. **Boot: the publication.** Four deep real-data tables, zero charts, zero chart tools — only the five global tools exist. To a human, nothing suggests a dashboard.
2. **`create_view {"dataset":"temp-anomaly"}`** — the warming curve draws in, and its five-tool family **registers at runtime**. `getTools()` grows mid-session.
3. **Interview it** — `find_extremes` answers *"+1.28 °C in 2024, the warmest year in the instrumental record"* from the page's own arrays while the gold highlight lands on the point; `sonify` plays the century.
4. **Reorganize** — *"show it as stripes"* is another `create_view` call: the same 146 rows re-render as queryable warming stripes **beside** the line. Multiple kinds of one dataset coexist; the family registers once per dataset and dies with its last view.
5. **`clear_workspace`** — every family unregisters, focus clears, and the cards of the publication return. Same canvas, a different dashboard every conversation.

## Tool inventory

Five global tools are always registered; each dataset's family is **born at runtime** with
its first commissioned view, swaps in and out with focus, and unregisters when its last view
is removed — 16 family tools across 4 datasets, **21 tools in all**.

| Scope | Tools |
|---|---|
| **Global (always on)** | `describe_screen` · `list_visualizations` · `create_view` · `clear_workspace` · `focus_chart` |
| **temp-anomaly** — NASA GISTEMP v4, 1880–2025 (146 rows) | `query_point` · `query_range` · `find_extremes` · `describe_trend` · `sonify` |
| **co2-emitters** — OWID / Global Carbon Budget, 1850–2024 (1,640 rows: world + full series for the 10 biggest emitters) | `query_point` · `query_range` · `find_extremes` · `describe_trend` · `compare_emitters` · `sonify` |
| **wealth-carbon** — OWID, 164 countries, 2022 | `describe_relationship` · `query_nearest` |
| **co2-live** — NOAA Mauna Loa weekly means (76 rows + session ticks) | `current_value` · `session_stats` · `sonify` |

(Family tool names are prefixed with their dataset id, e.g. `temp-anomaly_find_extremes`.)
The `co2-live` family **re-registers on every feed tick**, so `current_value`'s description
in `getTools()` carries the latest ppm — tool listings that visibly change over a session.

**Nine chart kinds** are commissionable, whitelisted per dataset: `line`, `area` (diverging),
`stripes` (queryable warming stripes), `bar`, `hbar` (ranked), `share` (share-of-total bar —
the craft-approved pie alternative), `scatter`, `live`, `stat` (single big figure).

## Run it locally

```sh
npm install
npm run dev          # http://localhost:5173 — works fully offline from the baked JSON
npm run build        # type-check + production build
npm run check        # browserless unit checks (registry, workspace arc, tools, sonify, intents)
```

### Reproduce the demo in 2 minutes (genuine agent execution)

1. Chrome 149+ → `chrome://flags/#enable-webmcp-testing` → **Enabled** → relaunch.
2. Open **https://auricle-khaki.vercel.app** (or `npm run dev`). The page registers its five
   global tools on `document.modelContext` — nothing visible changes; that's the point.
3. Point any WebMCP agent at the tab and ask, in your own words:
   *"What can you do on this page?"* → the agent calls `describe_screen` and onboards itself.
   *"Show me warming over time."* → the publication yields; a chart is born.
   *"Show it as stripes."* · *"When was the hottest year?"* · *"Play the century as sound."*
   (click **Enable sound** in the footer once first) · *"Start over."*
   Agent clients that work today: ChatGPT's built-in browser with Site Tools, or the
   [Model Context Tool Inspector](https://github.com/beaufortfrancois/model-context-tool-inspector)
   extension's natural-language mode — both do the real `getTools()` → reason →
   `executeTool()` loop against this page.
4. Watch `await document.modelContext.getTools()` in DevTools before and after a view is
   commissioned — the chart's tool family registers into existence at runtime.

**No agent? The secret stays a secret.** The page deliberately has no chat box, form, or
mic — to a visitor it is just a publication. For development and QA only, a silent console
hook `window.__auricleRunIntent('…')` drives the same registered tool definitions through
the host's `executeTool` (falling back to the registry's shared local pipeline where no
WebMCP host exists). It is a test utility, not the demo path.

## Data & sources

All figures are real, fetched keyless by [`scripts/fetch-data.ts`](./scripts/fetch-data.ts)
and baked to JSON so the app builds with no network. Re-run with `npm run fetch-data`.
See [`src/data/README.md`](./src/data/README.md) for what each series actually shows.

- **Global temperature anomaly, 1880–2025** — [NASA GISTEMP v4](https://data.giss.nasa.gov/gistemp/) (record **+1.28 °C in 2024** vs 1951–1980; 1880 was −0.17)
- **Global CO₂ + the 10 biggest emitters, full annual series** — [Our World in Data / Global Carbon Budget](https://ourworldindata.org/grapher/annual-co2-emissions-per-country) (record **38,599 Mt in 2024**; China 12,289 Mt; 1,640 country-year rows)
- **GDP per capita vs CO₂ per capita** — [OWID](https://ourworldindata.org/grapher/co2-emissions-vs-gdp), 164 countries, 2022 (r≈0.78)
- **CO₂ at Mauna Loa** — [NOAA GML weekly means](https://gml.noaa.gov/ccgg/trends/) (latest baked **426.94 ppm**; the runtime ticks are a clearly-labelled bounded simulation seeded from that real value)

Auricle was built first on Zambian open data, then pointed at the planet — the grammar is
dataset-agnostic (the Zambia fetch logic lives in git history).

## Accessibility

Semantic landmarks and headings, `role="img"` + real-figure `aria-label` on every chart, a
source-cited real `<table>` (caption + `th scope`) for every dataset (the publication *is*
the WCAG 1.1.1 floor), a **visually-hidden `aria-live` region that speaks every executed
tool's narrated answer** — the thesis working with zero pixels — keyboard-operable
controls, and `prefers-reduced-motion` respected (including instant card↔dashboard swaps). It has **not** yet been tested with blind or low-vision
users — see the honest limits in [PATTERN.md](./PATTERN.md); feedback from that community is
the point.

## License

[MIT](./LICENSE) — © 2026 Auricle contributors. The [agent-accessibility grammar](./PATTERN.md) is free to adopt and improve.
