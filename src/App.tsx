import { useEffect, useRef, useState } from 'react'
import './App.css'
import {
  registerDashboard,
  initFocus,
  useFocusedChart,
  setFocus,
  getChart,
  useWorkspace,
  refreshLiveSurface,
  type WorkspaceView,
} from './dashboard'
import { startLiveFeed, subscribeLiveFeed } from './dashboard/liveFeed'
import { ChartCard, useChartHighlight } from './charts'
import { useToolLog } from './lib/agent-a11y'
import { tempLine } from './charts/data.ts'
import { stripeColor } from './charts/StripesChart.tsx'
import { Publication, ToolSpeechAnnouncer, Colophon } from './publication/Publication.tsx'
// Side-effect import: keeps the silent `window.__auricleRunIntent` console hook
// (the demo/QA path) installed even though no on-page UI drives intents anymore.
import './voice/intents.ts'

/**
 * The stripes identity band — DECORATIVE identity art, computed from the REAL
 * NASA GISTEMP anomaly series: the yearly values are bucketed to ~40 columns
 * and each bucket's mean anomaly is mapped through the SAME blue→white→red
 * ramp the queryable StripesChart uses (`stripeColor`). It is aria-hidden
 * because it is the masthead's identity art, not a chart an agent can query —
 * the QUERYABLE stripes are the commissioned StripesChart view.
 */
const STRIPE_BAND: readonly string[] = (() => {
  const bucket = Math.max(1, Math.ceil(tempLine.length / 40))
  const means: number[] = []
  for (let i = 0; i < tempLine.length; i += bucket) {
    const slice = tempLine.slice(i, i + bucket)
    means.push(slice.reduce((sum, p) => sum + p.y, 0) / slice.length)
  }
  const min = Math.min(...means)
  const max = Math.max(...means)
  return means.map((v) => stripeColor(v, min, max))
})()

function StripesBand() {
  return (
    <div className="stripes-band" aria-hidden="true">
      {STRIPE_BAND.map((color, i) => (
        <span
          key={i}
          style={{ background: color, animationDelay: `${(0.02 + i * 0.028).toFixed(3)}s` }}
        />
      ))}
    </div>
  )
}

// Register the agent layer once, at module load: the five global tools ONLY.
// No chart surfaces exist at boot — the app is a publication of deep tables,
// and a chart's surface + tool family is born when the agent's create_view
// commissions it. initFocus is a no-op on the publication (nothing to focus).
registerDashboard()
initFocus()

/**
 * The one-line provenance caption under a commissioned view — an editorial
 * footnote, not a chat: the most recent tool call that touched this dataset
 * (`argsSummary`) and the answer it computed (`speech`), in mono, clamped to a
 * single line. This is the only place the agent's calls surface visually.
 */
function Provenance({ chartId }: { chartId: string }) {
  const log = useToolLog()
  const entry = [...log]
    .reverse()
    .find(
      (e) =>
        e.tool.startsWith(`${chartId}_`) ||
        ((e.tool === 'create_view' || e.tool === 'focus_chart') &&
          e.argsSummary.includes(chartId)),
    )
  if (!entry) return null
  return (
    <p className="provenance" title={entry.speech}>
      <span className="provenance__call">{entry.argsSummary}</span>
      <span aria-hidden="true"> → </span>
      <span className="provenance__result">{entry.speech}</span>
    </p>
  )
}

/**
 * One commissioned view instance. Subscribes to the mirror bus for ITS OWN
 * chartId, so a highlight routes to EVERY rendered view of that dataset — the
 * line gets its band/point, the stripes ring their year column, hbar/share
 * ring their bar or segment, and a stat tile flashes. A one-line provenance
 * caption under the figure names the call that produced what it shows.
 */
function WorkspaceViewCard({
  view,
  variant,
}: {
  view: WorkspaceView
  variant: 'hero' | 'small'
}) {
  const chart = getChart(view.chartId)
  const highlight = useChartHighlight(view.chartId)
  if (!chart) return null
  return (
    <div className="view">
      <ChartCard chart={chart} kind={view.kind} variant={variant} onFocus={setFocus} highlight={highlight} />
      <Provenance chartId={view.chartId} />
    </div>
  )
}

/**
 * The commissioned workspace — the "different dashboard every conversation".
 * Views are (chartId, kind) instances passed in by App (so the exit animation
 * can keep drawing them after `clear_workspace` empties the store). The hero
 * slot shows the FOCUSED dataset's most-recent view; every other view renders
 * in the row.
 */
function Workspace({
  views,
  leaving,
}: {
  views: readonly WorkspaceView[]
  leaving: boolean
}) {
  const focusedId = useFocusedChart()
  const heroView =
    [...views].reverse().find((v) => v.chartId === focusedId) ?? views[views.length - 1]
  if (!heroView) return null
  const others = views.filter((v) => v !== heroView)

  return (
    <div className={`charts-col${leaving ? ' charts-col--leaving' : ''}`}>
      <WorkspaceViewCard
        key={`${heroView.chartId}:${heroView.kind}`}
        view={heroView}
        variant="hero"
      />

      {others.length > 0 && (
        <div className="charts-row" role="list" aria-label="Other commissioned views — click to focus">
          {others.map((v) => (
            <div role="listitem" key={`${v.chartId}:${v.kind}`}>
              <WorkspaceViewCard view={v} variant="small" />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** `true` when the viewer asked the browser to reduce motion. */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  )
}

/** The canvas's presentation stage: cards ↔ dashboard, with exit phases. */
type Stage = 'cards' | 'cards-leaving' | 'dash' | 'dash-leaving'

const CARDS_EXIT_MS = 460
const DASH_EXIT_MS = 380

/**
 * Same canvas, different dashboards: when the first view is commissioned the
 * publication's cards animate out and the dashboard is born in their place;
 * `clear_workspace` reverses it (dashboard out, cards back). Under reduced
 * motion the leaving stages are skipped entirely — the swap is instant.
 */
function useStage(hasViews: boolean): Stage {
  const [stage, setStage] = useState<Stage>(hasViews ? 'dash' : 'cards')
  useEffect(() => {
    if (hasViews) {
      if (stage === 'dash' || stage === 'dash-leaving') {
        if (stage === 'dash-leaving') setStage('dash')
        return
      }
      if (prefersReducedMotion()) {
        setStage('dash')
        return
      }
      setStage('cards-leaving')
      const t = window.setTimeout(() => setStage('dash'), CARDS_EXIT_MS)
      return () => window.clearTimeout(t)
    }
    if (stage === 'cards' || stage === 'cards-leaving') {
      if (stage === 'cards-leaving') setStage('cards')
      return
    }
    if (prefersReducedMotion()) {
      setStage('cards')
      return
    }
    setStage('dash-leaving')
    const t = window.setTimeout(() => setStage('cards'), DASH_EXIT_MS)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stage transitions drive themselves
  }, [hasViews])
  return stage
}

/**
 * Auricle — a normal website with a secret.
 *
 * To a visitor: a climate-data publication — four deep, scrollable dataset
 * tables under the Warming Stripes masthead. To an agent: a workbench — five
 * global WebMCP tools at boot, per-view tool families born by `create_view`.
 * The page has no chat UI: the agent does the talking in its own chat (every
 * tool returns narrated speech), and the page answers SPATIALLY — charts
 * materialize, highlights draw, sound plays. A visually-hidden live region
 * (`ToolSpeechAnnouncer`) speaks every answer to screen readers.
 */
function App() {
  const views = useWorkspace()
  const stage = useStage(views.length > 0)
  // Keep the last non-empty view list so the dashboard can still be drawn
  // during its exit animation (the store is already empty by then).
  const lastViews = useRef<readonly WorkspaceView[]>(views)
  if (views.length > 0) lastViews.current = views

  // Start the ~5s simulated CO₂ feed and re-register the co2-live family on
  // every tick (once commissioned), so `current_value`'s description changes
  // over time in getTools() and its session stats are genuinely session-local.
  useEffect(() => {
    const stop = startLiveFeed()
    const unsub = subscribeLiveFeed(refreshLiveSurface)
    return () => {
      unsub()
      stop()
    }
  }, [])

  const showCards = stage === 'cards' || stage === 'cards-leaving'

  return (
    <div className="app">
      <header className="masthead">
        <div className="masthead__name">Auricle</div>
        <div className="masthead__tagline">interview the planet</div>
      </header>

      {/* Identity art from the real anomaly data, above the 2px ink rule. */}
      <StripesBand />
      <div className="masthead__rule" aria-hidden="true" />

      <main className="app-main">
        <h1 className="sr-only">Auricle — the climate dashboard you can interview</h1>

        {showCards ? (
          <Publication leaving={stage === 'cards-leaving'} />
        ) : (
          <Workspace
            views={views.length > 0 ? views : lastViews.current}
            leaving={stage === 'dash-leaving'}
          />
        )}
      </main>

      <Colophon />

      {/* Zero pixels; every tool's narrated answer, spoken to screen readers. */}
      <ToolSpeechAnnouncer />
    </div>
  )
}

export default App
