import { useSyncExternalStore } from 'react'
import './App.css'
import { CHARTS, registerDashboard, initFocus, useFocusedChart, setFocus, getChart, DEFAULT_FOCUS } from './dashboard'
import { ChartCard, useChartHighlight } from './charts'
import { Rail } from './rail/Rail'
import { subscribeAudio, isAudioReady, armAudio } from './sonify'

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

        <div className="app-header__status">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--red-accent)"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0" />
            <path d="M12 18v3" />
          </svg>
          <span className="app-header__status-label">Listening</span>
          <span className="app-header__bars" aria-hidden="true">
            <span style={{ height: '6px' }} />
            <span style={{ height: '12px' }} />
            <span style={{ height: '8px' }} />
            <span style={{ height: '13px' }} />
            <span style={{ height: '5px' }} />
          </span>
        </div>

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
