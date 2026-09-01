import './App.css'

/**
 * Auricle — the dashboard you can interview.
 *
 * This item scaffolds the shell: a high-contrast, hyperlegible header and a
 * placeholder main region. Later items build the interviewable charts,
 * conversation rail, and WebMCP tool registration.
 */
function App() {
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
        <div className="app-main__placeholder">
          <h2>Charts land here</h2>
          <p>
            The interviewable data views, conversation rail, and{' '}
            <code>document.modelContext</code> tools arrive in later work items.
          </p>
        </div>
      </main>
    </div>
  )
}

export default App
