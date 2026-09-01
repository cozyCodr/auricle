# Auricle

**The dashboard you can interview.**

Auricle is a WebMCP data dashboard for Zambian open data (2015–2025). Every
answer comes from the page's own data model — exposed to AI agents as
[WebMCP](https://github.com/webmachinelearning/webmcp) tools via
`document.modelContext` — never a screenshot guess. Ask it a question and it
highlights the chart, finds the extremes, and can even sonify a series.

Built for the WebMCP hackathon.

## Stack

- [Vite](https://vite.dev/) + [React](https://react.dev/) + TypeScript
- Static site — no backend; deploys to Cloudflare Pages
- `webmcp-types` for `document.modelContext` typings
- Fonts: Atkinson Hyperlegible (body) + Spline Sans Mono (figures)

## Develop

```sh
npm install
npm run dev      # start the dev server
npm run build    # type-check + production build
npm run preview  # preview the production build
```

## License

[MIT](./LICENSE) — © 2026 Auricle contributors.
