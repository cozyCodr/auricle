import './App.css'
import { CHARTS, registerDashboard, initFocus, useFocusedChart, setFocus, getChart, DEFAULT_FOCUS } from './dashboard'
import { ChartCard, maizeDemoHighlight } from './charts'

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
      </header>

      <main className="app-main">
        <h1 className="sr-only">Auricle — interviewable Zambia open-data dashboard</h1>

        {/* Charts column */}
        <div className="charts-col">
          <ChartCard
            chart={heroChart}
            variant="hero"
            onFocus={setFocus}
            highlight={heroChart.id === 'maize-prices' ? maizeDemoHighlight : undefined}
          />

          <div className="charts-row" role="list" aria-label="Other charts — click to focus">
            {others.map((c) => (
              <div role="listitem" key={c.id}>
                <ChartCard chart={c} variant="small" onFocus={setFocus} />
              </div>
            ))}
          </div>
        </div>

        {/* Conversation rail placeholder — the real rail arrives in 3.3 */}
        <aside className="rail-placeholder" aria-label="Conversation (coming soon)">
          <div className="rail-placeholder__label">Conversation</div>
          <p className="rail-placeholder__note">
            The interview rail — questions, spoken answers, and the plain-words tool
            log — arrives next. The agent tools (<code>describe_screen</code>,{' '}
            <code>focus_chart</code>) are already live on{' '}
            <code>document.modelContext</code>.
          </p>
        </aside>
      </main>
    </div>
  )
}

export default App
