import './App.css'
import { useState } from 'react'
import { registry, useAgentAvailable, useMirror, useToolLog } from './lib/agent-a11y'
import { CHARTS, registerDashboard } from './dashboard'

// Register the agent layer once, at module load: the three global orientation
// tools + a focusable surface per chart. Safe no-op without WebMCP.
registerDashboard()

/**
 * TEMP 2.2 debug panel — remove in 3.1 when the real charts + conversation rail
 * land. Lets a WebMCP Chrome eyeball focus swaps and the tool log without the
 * chart visuals existing yet. Purely a scaffold; registers nothing itself.
 */
function DebugPanel() {
  const available = useAgentAvailable()
  const log = useToolLog()
  const [lastMirror, setLastMirror] = useState<string>('—')
  useMirror((e) => setLastMirror(JSON.stringify(e)))

  return (
    <section
      style={{
        margin: '16px',
        padding: '16px',
        border: '2px dashed var(--red-accent, #c0392b)',
        borderRadius: '8px',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <strong>TEMP 2.2 debug panel</strong> (3.1 removes this) — WebMCP:{' '}
      <code>{available ? 'available' : 'absent (no-op)'}</code>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', margin: '8px 0' }}>
        {CHARTS.map((c) => (
          <button key={c.id} type="button" onClick={() => registry.focus(c.id)}>
            focus {c.id}
          </button>
        ))}
        <button type="button" onClick={() => registry.blur()}>
          blur
        </button>
      </div>
      <div>
        last mirror: <code>{lastMirror}</code>
      </div>
      <div>tool log ({log.length}):</div>
      <ul>
        {log.map((entry, i) => (
          <li key={i}>
            <code>{entry.argsSummary}</code> → {entry.speech}
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * Auricle — the dashboard you can interview.
 *
 * This item wires the agent layer (global orientation tools + per-chart
 * surfaces) behind the shell. The real interviewable chart visuals and the
 * conversation rail arrive in 3.1; a temporary debug panel stands in for now.
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
        {/* TEMP: 2.2 debug panel — replaced by real charts + rail in 3.1 */}
        <DebugPanel />
        <div className="app-main__placeholder">
          <h2>Charts land here</h2>
          <p>
            The interviewable data views and conversation rail arrive in the next
            work item. The agent tools (<code>describe_screen</code>,{' '}
            <code>list_visualizations</code>, <code>focus_chart</code>) are already
            live on <code>document.modelContext</code>.
          </p>
        </div>
      </main>
    </div>
  )
}

export default App
