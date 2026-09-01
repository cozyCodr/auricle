import './App.css'
// TEMP: 2.1 verification harness — replaced by real tools in 2.2
import { useState } from 'react'
import {
  registry,
  useAgentAvailable,
  useMirror,
  useSurface,
  useToolLog,
} from './lib/agent-a11y'
import type { SurfaceDef } from './lib/agent-a11y'

// TEMP: 2.1 verification harness — a global orientation tool + two surface
// families, plus focus buttons, so a WebMCP Chrome can confirm getTools()
// shows globals + only the focused family. Removed/rebuilt in 2.2 and 3.2.
const objectSchema = { type: 'object', properties: {} }

const maizeSurface: SurfaceDef = {
  describe: 'Maize retail price, monthly, Zambia.',
  tools: [
    {
      name: 'maize_summary',
      description: 'Summarise the maize price trend.',
      inputSchema: objectSchema,
      execute: () => ({
        speech: 'Maize rose 41% over the window, from K95 to K134.',
        mirror: { kind: 'highlight-range', chartId: 'maize', start: '2022-01', end: '2024-12' },
      }),
    },
  ],
}

const mortalitySurface: SurfaceDef = {
  describe: 'Under-5 mortality per 1,000 live births, yearly.',
  tools: [
    {
      name: 'mortality_summary',
      description: 'Summarise the under-5 mortality trend.',
      inputSchema: objectSchema,
      execute: () => ({ speech: 'Under-5 mortality fell 38% across the decade.' }),
    },
  ],
}

// Register the always-on orientation tool once, at module load.
registry.registerGlobal({
  name: 'describe_screen',
  description: 'Describe what is on screen and which chart is focused.',
  inputSchema: objectSchema,
  execute: () => ({
    speech: `Auricle shows Zambian open data. Focused surface: ${registry.focused ?? 'none'}.`,
  }),
})

function AgentHarness() {
  const available = useAgentAvailable()
  const log = useToolLog()
  const [lastMirror, setLastMirror] = useState<string>('—')
  useMirror((e) => setLastMirror(JSON.stringify(e)))
  useSurface('maize', maizeSurface)
  useSurface('mortality', mortalitySurface)

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
      <strong>TEMP 2.1 harness</strong> — WebMCP:{' '}
      <code>{available ? 'available' : 'absent (no-op)'}</code>
      <div style={{ display: 'flex', gap: '8px', margin: '8px 0' }}>
        <button type="button" onClick={() => registry.focus('maize')}>
          focus maize
        </button>
        <button type="button" onClick={() => registry.focus('mortality')}>
          focus mortality
        </button>
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
        {/* TEMP: 2.1 verification harness — replaced by real tools in 2.2 */}
        <AgentHarness />
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
