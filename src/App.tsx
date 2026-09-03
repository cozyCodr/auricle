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
} from './dashboard'
import { startLiveFeed, subscribeLiveFeed } from './dashboard/liveFeed'
import { ChartCard, useChartHighlight, DataTable, tableFor, rowCountFor, TOTAL_ROWS } from './charts'
import { Rail } from './rail/Rail'
import { subscribeAudio, isAudioReady, armAudio } from './sonify'
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
      className={`app-header__sound${ready ? ' app-header__sound--on' : ''}`}
      aria-pressed={ready}
      onClick={() => void armAudio()}
      title={ready ? 'Audio is enabled — ask an agent to play a chart as sound' : 'Enable audio so charts can be played as sound'}
    >
      {ready ? (
        <>
          <span aria-hidden="true">♪</span> Sound on
        </>
      ) : (
        <>
          <span aria-hidden="true">♪</span> Enable sound
        </>
      )}
    </button>
  )
}

/** Five decorative level bars; they animate only while listening (CSS-driven). */
function LevelBars() {
  return (
    <span className="app-header__bars" aria-hidden="true">
      <span />
      <span />
      <span />
      <span />
      <span />
    </span>
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
    <button
      type="button"
      className={`app-header__status app-header__voice${listening ? ' app-header__voice--active' : ''}${denied ? ' app-header__voice--denied' : ''}`}
      aria-pressed={listening}
      aria-label={aria}
      title={title}
      onClick={() => voice.current?.toggle()}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke={listening ? 'var(--red-accent)' : 'currentColor'}
        strokeWidth="2"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <rect x="9" y="3" width="6" height="11" rx="3" />
        <path d="M5 11a7 7 0 0 0 14 0" />
        <path d="M12 18v3" />
      </svg>
      <span className="app-header__status-label">
        {listening && interim ? interim : label}
      </span>
      <LevelBars />
    </button>
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
          {live ? ' · live' : ''}
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

/** The commissioned workspace: the focused view large, the rest in a row. */
function Workspace() {
  const views = useWorkspace()
  const focusedId = useFocusedChart()
  const heroView = views.find((v) => v.chartId === focusedId) ?? views[0]
  const heroChart = getChart(heroView.chartId) ?? CHARTS[0]
  const others = views.filter((v) => v.chartId !== heroView.chartId)
  // Mirror-driven: the focused chart's live highlight, painted on the hero.
  const highlight = useChartHighlight(heroChart.id)

  return (
    <div className="charts-col">
      <ChartCard chart={heroChart} variant="hero" onFocus={setFocus} highlight={highlight} />

      {others.length > 0 && (
        <div className="charts-row" role="list" aria-label="Other commissioned views — click to focus">
          {others.map((v) => {
            const c = getChart(v.chartId)
            if (!c) return null
            return (
              <div role="listitem" key={v.chartId}>
                <ChartCard chart={c} variant="small" onFocus={setFocus} />
              </div>
            )
          })}
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
      <header className="app-header">
        {/* Shield / ear mark */}
        <svg
          className="app-header__mark"
          width="30"
          height="30"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          role="img"
          aria-label="Auricle"
        >
          <path d="M6 20a4 4 0 0 1-2-3.5C4 10 7 4 12 4s8 6 8 12.5A4 4 0 0 1 18 20" />
          <path d="M9 20v-4a3 3 0 0 1 6 0v4" />
        </svg>

        <div className="app-header__titles">
          <div className="app-header__name">Auricle</div>
          <div className="app-header__tagline">interview the planet</div>
        </div>

        <div className="app-header__note">climate · four real open datasets</div>

        <VoiceMic />

        <EnableSoundButton />
      </header>

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
