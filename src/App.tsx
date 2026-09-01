import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import './App.css'
import { CHARTS, registerDashboard, initFocus, useFocusedChart, setFocus, getChart, DEFAULT_FOCUS } from './dashboard'
import { startLiveFeed, subscribeLiveFeed } from './dashboard/liveFeed'
import { refreshExchangeSurface } from './dashboard/surfaces'
import { ChartCard, useChartHighlight } from './charts'
import { Rail } from './rail/Rail'
import { subscribeAudio, isAudioReady, armAudio } from './sonify'
import { createVoice, isVoiceSupported, type VoiceState } from './voice'
import { setQuestion } from './rail/conversation'
import { runIntent } from './voice/intents'

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
 * The header push-to-talk mic (Web Speech). Click to start, click to stop; a
 * finished utterance lands as the conversation's question and then runs the
 * local demo-intent matcher (which drives the SAME WebMCP tools an external
 * agent would, when `document.modelContext` is present).
 *
 * Feature-detected: renders NOTHING on browsers without Web Speech, so the app
 * stays fully usable. Idle reads "Ask by voice" (never claims it's listening);
 * active reads "Listening…" with animated bars (stilled by reduced-motion).
 */
function VoiceMic() {
  // Feature-detect once. Hidden entirely where Web Speech is unavailable.
  const supported = useMemo(() => isVoiceSupported(), [])
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

// Register the agent layer once, at module load: the three global orientation
// tools + a focusable surface per chart. Then sync the registry to the default
// focus so the maize hero's tool family is registered from the first paint.
registerDashboard()
initFocus()

/**
 * Auricle — the dashboard you can interview.
 *
 * The header (from 1.1) plus the charts column: a large focused hero card and a
 * 3-across row of the remaining charts, which render dimmed and captioned
 * "unfocused — tools unregistered". Clicking a small card — or the agent calling
 * `focus_chart` — moves that chart into the hero slot via the shared focus
 * controller. The conversation rail is a placeholder here; it lands in 3.3.
 */
function App() {
  const focusedId = useFocusedChart() ?? DEFAULT_FOCUS
  const heroChart = getChart(focusedId) ?? CHARTS[0]
  const others = CHARTS.filter((c) => c.id !== heroChart.id)
  // Mirror-driven: the focused chart's live highlight, painted on the hero.
  const highlight = useChartHighlight(heroChart.id)

  // 4.3: start the ~5s simulated ZMW/USD feed and re-register the exchange family
  // on every tick, so `current_value`'s description changes over time in getTools()
  // and its session_stats are genuinely session-local. Cleaned up on unmount.
  useEffect(() => {
    const stop = startLiveFeed()
    const unsub = subscribeLiveFeed(refreshExchangeSurface)
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
          <div className="app-header__tagline">the dashboard you can interview</div>
        </div>

        <div className="app-header__pill">Zambia · open data 2015–2025</div>

        <VoiceMic />

        <EnableSoundButton />
      </header>

      <main className="app-main">
        <h1 className="sr-only">Auricle — interviewable Zambia open-data dashboard</h1>

        {/* Charts column */}
        <div className="charts-col">
          <ChartCard chart={heroChart} variant="hero" onFocus={setFocus} highlight={highlight} />

          <div className="charts-row" role="list" aria-label="Other charts — click to focus">
            {others.map((c) => (
              <div role="listitem" key={c.id}>
                <ChartCard chart={c} variant="small" onFocus={setFocus} />
              </div>
            ))}
          </div>
        </div>

        {/* Conversation + tool-activity rail (3.3) */}
        <Rail />
      </main>
    </div>
  )
}

export default App
