import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import './App.css'
import {
  CHARTS,
  registerDashboard,
  initFocus,
  useFocusedChart,
  setFocus,
  getChart,
  useWorkspace,
  commissionView,
  refreshLiveSurface,
  type WorkspaceView,
} from './dashboard'
import { startLiveFeed, subscribeLiveFeed } from './dashboard/liveFeed'
import { ChartCard, useChartHighlight, DataTable, tableFor, rowCountFor, TOTAL_ROWS } from './charts'
import { Rail } from './rail/Rail'
import { subscribeAudio, isAudioReady, armAudio } from './sonify'
import { tempLine } from './charts/data.ts'
import { stripeColor } from './charts/StripesChart.tsx'
import { createVoice, isVoiceSupported, type VoiceState } from './voice'
import { setQuestion } from './rail/conversation'
import { isIntentExecutionAvailable, runIntent } from './voice/intents'

/** Live view of whether Web Audio has been armed (a user gesture resumed it). */
function useAudioReady(): boolean {
  return useSyncExternalStore(subscribeAudio, isAudioReady, () => false)
}

/**
 * "Enable sound" — the one-time gesture that lets the `*_sonify` tools play.
 * Browsers only start audio from a real click, so this button stays visible
 * (as an actionable control) until armed, then reads "Sound on".
 */
function EnableSoundButton() {
  const ready = useAudioReady()
  return (
    <button
      type="button"
      className={`masthead__control masthead__sound${ready ? ' masthead__sound--on' : ''}`}
      aria-pressed={ready}
      onClick={() => void armAudio()}
      title={ready ? 'Audio is enabled — ask an agent to play a chart as sound' : 'Enable audio so charts can be played as sound'}
    >
      {ready ? 'Sound on' : 'Enable sound'}
    </button>
  )
}

/**
 * The optional Chrome rehearsal mic (Web Speech). Click to start, click to
 * stop; a finished utterance lands as the conversation's question and then
 * runs the small demo-intent matcher through Chrome's imperative WebMCP test
 * API. In ChatGPT, the primary interaction is speaking or typing to Codex.
 *
 * Feature-detected: renders only when Web Speech and `executeTool()` are both
 * available. Idle reads "Ask by voice" (never claims it's listening); active
 * reads "Listening…" with animated bars (stilled by reduced-motion).
 */
function VoiceMic() {
  // Feature-detect once. Hidden entirely where Web Speech is unavailable.
  const supported = useMemo(
    () => isVoiceSupported() && isIntentExecutionAvailable(),
    [],
  )
  const [state, setState] = useState<VoiceState>('idle')
  const [interim, setInterim] = useState('')

  const voice = useRef<ReturnType<typeof createVoice> | null>(null)
  if (supported && !voice.current) {
    voice.current = createVoice({
      onStateChange: setState,
      onInterim: (t) => setInterim(t),
      onFinal: (transcript) => {
        setInterim('')
        setQuestion(transcript) // the question bubble renders this reactively
        void runIntent(transcript) // demo mode: fire the matching WebMCP tool(s)
      },
    })
  }

  if (!supported) return null

  const listening = state === 'listening'
  const denied = state === 'denied'
  const label = denied
    ? 'Mic blocked'
    : listening
      ? 'Listening…'
      : state === 'error'
        ? 'Try again'
        : 'Ask by voice'
  const aria = listening ? 'Stop voice input' : 'Start voice input'
  const title = denied
    ? 'Microphone permission was blocked — enable it in the browser site settings, then click again.'
    : 'Push to talk: click to start, click to stop. Your question appears in the conversation.'

  return (
    <>
      <span className="masthead__sep" aria-hidden="true">
        ·
      </span>
      <button
        type="button"
        className={`masthead__control masthead__voice${listening ? ' masthead__voice--active' : ''}${denied ? ' masthead__voice--denied' : ''}`}
        aria-pressed={listening}
        aria-label={aria}
        title={title}
        onClick={() => voice.current?.toggle()}
      >
        {listening && <span className="masthead__live-square" aria-hidden="true" />}
        <span className="masthead__control-label">
          {listening && interim ? interim : label}
        </span>
      </button>
    </>
  )
}

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
// No chart surfaces exist at boot — the app is a raw data shelf, and a chart's
// surface + tool family is born when create_view (or a shelf click) commissions
// it. initFocus is a no-op on the shelf (nothing to focus yet).
registerDashboard()
initFocus()

/**
 * One dataset on the raw shelf: a header button (clicking it commissions the
 * dataset's canonical view — the SAME code path as the create_view tool) above
 * the full, dense real-data table.
 */
function ShelfDataset({ chartId }: { chartId: string }) {
  const chart = getChart(chartId)
  const model = tableFor(chartId)
  if (!chart || !model) return null
  const live = chart.kind === 'live'
  return (
    <section className="shelf__dataset" aria-label={`${chart.title} — raw data`}>
      <button
        type="button"
        className="shelf__dataset-head"
        onClick={() => commissionView(chartId)}
        title={`Build the ${chart.title} view (same as create_view)`}
      >
        <span className="shelf__dataset-title">{chart.title}</span>
        <span className="shelf__dataset-meta">
          {' '}· {chart.source.split('—')[0].trim()} · {rowCountFor(chartId)} rows
          {live && (
            <>
              {' · '}
              <span className="shelf__dataset-meta--live">live</span>
            </>
          )}
        </span>
      </button>
      <DataTable model={model} />
    </section>
  )
}

/**
 * The raw data shelf — Auricle's initial state. No charts: four dense tables of
 * real rows, a headline that tells the truth ("N rows. Zero answers."), and an
 * invitation to commission views by asking. Clicking a dataset's header
 * commissions its canonical view through the same path as create_view.
 */
function Shelf() {
  return (
    <div className="shelf">
      <div className="shelf__lede">
        <h2 className="shelf__headline">{TOTAL_ROWS.toLocaleString('en-US')} rows. Zero answers.</h2>
        <p className="shelf__sub">
          This is the planet's data as a screen reader meets it — readable, row by
          row, and unanswerable. Ask, and the dashboard builds itself.
        </p>
      </div>
      <div className="shelf__grid">
        {CHARTS.map((c) => (
          <ShelfDataset key={c.id} chartId={c.id} />
        ))}
      </div>
    </div>
  )
}

/**
 * One commissioned view instance. Subscribes to the mirror bus for ITS OWN
 * chartId, so a highlight routes to EVERY rendered view of that dataset — the
 * line gets its band/point, the stripes ring their year column, hbar/share
 * ring their bar or segment, and a stat tile flashes.
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
    <ChartCard chart={chart} kind={view.kind} variant={variant} onFocus={setFocus} highlight={highlight} />
  )
}

/**
 * The commissioned workspace. Views are (chartId, kind) instances — the same
 * dataset can hang here as several kinds at once. The hero slot shows the
 * FOCUSED dataset's most-recent view; every other view (including a second
 * kind of the same dataset) renders in the row.
 */
function Workspace() {
  const views = useWorkspace()
  const focusedId = useFocusedChart()
  const heroView =
    [...views].reverse().find((v) => v.chartId === focusedId) ?? views[views.length - 1]
  const others = views.filter((v) => v !== heroView)

  return (
    <div className="charts-col">
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

/**
 * Auricle — the dashboard you can interview.
 *
 * Boots as the raw data shelf (no charts, four dense real-data tables). Views
 * are commissioned — by the agent's `create_view` tool or a click on a shelf
 * table's header — and appear with the focused view large and the rest in a
 * row. `clear_workspace` returns everything to the shelf.
 */
function App() {
  const views = useWorkspace()

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

  return (
    <div className="app">
      <header className="masthead">
        <div className="masthead__name">Auricle</div>
        <div className="masthead__tagline">interview the planet</div>
        <div className="masthead__controls">
          <EnableSoundButton />
          <VoiceMic />
        </div>
      </header>

      {/* Identity art from the real anomaly data, above the 2px ink rule. */}
      <StripesBand />
      <div className="masthead__rule" aria-hidden="true" />

      <main className="app-main">
        <h1 className="sr-only">Auricle — the climate dashboard you can interview</h1>

        {views.length === 0 ? <Shelf /> : <Workspace />}

        {/* Conversation + tool-activity rail */}
        <Rail />
      </main>
    </div>
  )
}

export default App
