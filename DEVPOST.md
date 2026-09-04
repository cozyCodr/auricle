# Auricle — interview the planet

**Live:** https://auricle-khaki.vercel.app · **Repo:** https://github.com/cozyCodr/auricle · **Video:** [YOUTUBE LINK — replace before submitting]

This looks like a normal website: a climate-data publication with 2,026 real rows from NASA GISTEMP, NOAA Mauna Loa, and Our World in Data. No chat box, no AI buttons. But it has a secret — it speaks WebMCP. Open it with an agent, and the publication becomes a workbench: the agent computes statistics from the page's own data, draws new chart views onto the canvas, highlights answers, and plays any series as sound. **Every chart on screen exists because someone asked.**

## Why this use case fits WebMCP

Charts are assistive technology's black hole — a screen reader hits the most important chart of our time and says "image." And a chatbot answering questions *about* a page can't act *on* it. WebMCP is the only layer where both problems dissolve: the page hands the agent tools whose answers are computed from the page's own data (never a guess at pixels), and whose side effects are visual — highlights drawn, views born, sound played — on a surface the user and agent share.

## How it improves the user experience

The site onboards the agent itself: one `describe_screen` call returns what's on screen and everything the agent can do for its user — no SDK, no docs page, no integration. Then the dashboard builds itself from questions: "show me warming over time" births a chart *and registers its five tools into existence at runtime*; "show it as stripes" re-renders the same 146 years as a new shape beside it (9 chart kinds); "when was the hottest year?" rings 2024 on the chart with the exact figure (+1.28 °C, computed page-side); "play the century as sound" sweeps 145 years as a rising tone whose loudness follows the temperature — the peak ping is last year. "Start over" folds it all back into the publication.

## What humans and agents can now do together

A person and their agent share one canvas: the agent operates, the page performs, the person sees every move (each commissioned view carries a provenance footnote of the call that made it). And beyond what you see: a visually-hidden live region speaks every tool answer to screen readers, and the sonification *is* the chart for someone who can't see it. Blind users get answers, not markup — the same conversation, the same surface, as everyone else.

## How we built it

`document.modelContext.registerTool({name, description, inputSchema, execute}, {signal})` throughout — 5 always-on globals plus per-dataset tool families born when their first view is commissioned and unregistered (AbortController) when the last one clears. The live CO₂ card re-registers its `current_value` tool on every tick, so `getTools()` visibly changes over time. Registration survives late host injection: a watcher polls both `document.modelContext` and `navigator.modelContext` and replays all registrations the moment a host appears, with a signal-free retry for hosts without abort support. The reusable layer — orientation-before-action, tools-follow-focus, narratable returns, visual mirroring, non-visual encodings — is extracted as an MIT-licensed library plus a written pattern (PATTERN.md): an accessibility grammar for the agentic web, proposed while the standard is still wet cement.

## Tested clients

ChatGPT's in-app browser (Site Tools) — end-to-end; Chrome 152 with `chrome://flags/#enable-webmcp-testing` — end-to-end; a WebMCP-API-driven agent (Claude in Chrome) during development. Fully open source, MIT, builds offline from committed real data (`npm run fetch-data` re-pulls the sources).
