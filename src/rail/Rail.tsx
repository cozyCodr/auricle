/**
 * Rail — the right-hand conversation + tool-activity rail (item 3.3).
 *
 * Top → bottom, matching the mockup:
 *   1. "Conversation" heading + truthful Site Tools availability and guidance.
 *   2. A functional typed rehearsal that executes the registered WebMCP tools.
 *   3. The latest question as a dark bubble (italic), when one has been asked.
 *   4. The latest agent-facing answer as a light bubble — the `speech` of the
 *      most recent tool-log entry (an empty-state line before any tool runs).
 *   4. "Tool calls · in plain words" — the executed-tool log, newest first,
 *      each line `argsSummary → speech`. This list is an ARIA live region so a
 *      screen reader announces each new tool result as it arrives.
 *   5. A pinned credo card at the bottom.
 *
 * The sonification mini-player shown in the mockup's answer bubble is item 4.1:
 * when a `<chartId>_sonify` tool runs it emits a `{kind:'sonify', durationMs}`
 * mirror event, and the answer bubble shows an animated equalizer bar for that
 * duration (a static "playing…" label under reduced-motion).
 */

import { useEffect, useId, useRef, useState } from 'react'
import { useAgentAvailable, useMirror, useToolLog } from '../lib/agent-a11y'
import type { LogEntry } from '../lib/agent-a11y'
import { runLocalIntent, type RunResult } from '../voice/intents.ts'
import { setQuestion, useQuestion } from './conversation.ts'

/** Truthful first-run guidance: the browser agent owns the conversation. */
function SiteToolsGuide() {
  const available = useAgentAvailable()
  return (
    <div className={`rail-agent${available ? ' rail-agent--ready' : ''}`} role="status">
      <p className="rail-agent__status">
        {available ? 'Site Tools ready' : 'Site Tools unavailable'}
      </p>
      <p className="rail-agent__body">
        {available
          ? 'Ask Codex in the conversation beside this browser. Auricle will answer through the page’s registered tools.'
          : 'Ask Codex after opening Auricle in the latest ChatGPT desktop app with GPT-5.6 Sol or Terra, or use WebMCP-enabled Chrome.'}
      </p>
      <p className="rail-agent__prompt">
        Try, by voice or through your agent:
        <br />
        <strong>“Show me warming over time.”</strong>
        <br />
        <strong>“Who emits the most?”</strong>
        <br />
        <strong>“When was the hottest year?”</strong>
        <br />
        <strong>“Play the century as sound.”</strong>
      </p>
    </div>
  )
}

function failureMessage(failure: RunResult['failure']): string {
  if (failure === 'unmatched') {
    return 'Try “Show me warming over time”, “When was the hottest year?”, “Who emits the most?”, “What’s CO2 right now?”, or “Start over”.'
  }
  if (failure === 'tool-not-found') {
    return 'That view’s tools are not registered yet. Commission it first (“Show me warming over time”) and try again.'
  }
  return 'Direct Ask needs WebMCP execution support. Use the latest ChatGPT desktop browser or WebMCP-enabled Chrome.'
}

/** Deterministic demo fallback that still runs the page's real WebMCP tools. */
function DirectAsk({ onStatus }: { onStatus(message: string | null): void }) {
  const inputId = useId()
  const [draft, setDraft] = useState('')
  const [running, setRunning] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const text = draft.trim()
    if (!text || running) return
    setQuestion(text)
    onStatus(null)
    setRunning(true)
    try {
      const result = await runLocalIntent(text)
      if (!result.executed) onStatus(failureMessage(result.failure))
      else setDraft('')
    } catch {
      onStatus('The WebMCP tool failed unexpectedly. Please try the prompt again.')
    } finally {
      setRunning(false)
    }
  }

  return (
    <form className="rail-ask" onSubmit={(event) => void submit(event)}>
      <label htmlFor={inputId} className="rail-ask__label">
        Ask Auricle directly
      </label>
      <div className="rail-ask__row">
        <input
          id={inputId}
          className="rail-ask__input"
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="When was the hottest year?"
          autoComplete="off"
          disabled={running}
        />
        <button className="rail-ask__button" type="submit" disabled={running || !draft.trim()}>
          {running ? 'Running…' : 'Ask'}
        </button>
      </div>
      <p className="rail-ask__hint">
        Reliable demo fallback · runs the same registered tool definitions and mirror pipeline.
      </p>
    </form>
  )
}

/** One tool-log line: `argsSummary → speech`, speech truncated to a line. */
function ToolCallLine({ entry }: { entry: LogEntry }) {
  return (
    <li className="rail-log__item">
      <code className="rail-log__call">{entry.argsSummary}</code>
      <span className="rail-log__arrow" aria-hidden="true">
        {' → '}
      </span>
      <span className="rail-log__result" title={entry.speech}>
        {entry.speech}
      </span>
    </li>
  )
}

/** `true` when the viewer asked the browser to reduce motion. */
function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

/**
 * The answer bubble's equalizer — shown while a sonify tool is playing. Nine
 * gold bars pulse on a staggered CSS animation; under reduced motion it degrades
 * to a static "playing…" label (the audio still plays — that is the feature).
 */
function SonifyBar({ seconds }: { seconds: number }) {
  if (prefersReducedMotion()) {
    return (
      <p className="rail-sonify rail-sonify--static" role="status">
        <span aria-hidden="true">▶</span> playing… ({seconds}s)
      </p>
    )
  }
  return (
    <div className="rail-sonify" role="img" aria-label={`Playing the series as sound, about ${seconds} seconds`}>
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} style={{ animationDelay: `${(i * 0.09).toFixed(2)}s` }} />
      ))}
    </div>
  )
}

export function Rail() {
  const log = useToolLog()
  const question = useQuestion()
  const [localStatus, setLocalStatus] = useState<string | null>(null)
  // Newest-first for display (the store is oldest→newest).
  const newestFirst = [...log].slice().reverse()
  const latestAnswer = newestFirst[0]?.speech ?? ''

  // Sonification bar: show for `durationMs` when a sonify mirror event arrives.
  const [sonifyMs, setSonifyMs] = useState(0)
  const timer = useRef<number | undefined>(undefined)
  useMirror((e) => {
    if (e.kind !== 'sonify') return
    const dur = typeof e.durationMs === 'number' && e.durationMs > 0 ? e.durationMs : 3000
    if (timer.current !== undefined) window.clearTimeout(timer.current)
    setSonifyMs(dur)
    timer.current = window.setTimeout(() => setSonifyMs(0), dur)
  })
  useEffect(() => () => {
    if (timer.current !== undefined) window.clearTimeout(timer.current)
  }, [])

  return (
    <aside className="rail" aria-label="Conversation and tool activity">
      <h2 className="sr-only">Conversation</h2>

      {/* The question as a Newsreader-italic pull-quote; a blinking-caret
          waiting line before anything has been asked. */}
      {question ? (
        <p className="rail-quote">“{question}”</p>
      ) : (
        <p className="rail-quote rail-quote--waiting">
          Ask the planet something.
          <span className="rail-caret" aria-hidden="true">
            ▎
          </span>
        </p>
      )}

      {/* The latest agent-facing answer as body text, a thin rule above. */}
      <div className="rail-a" role="status" aria-live="polite" aria-atomic="true">
        {latestAnswer ? (
          <p className="rail-a__text">{latestAnswer}</p>
        ) : localStatus ? (
          <p className="rail-a__text">{localStatus}</p>
        ) : (
          <p className="rail-a__text rail-a__text--empty">
            No views yet — every chart that appears here will exist because you
            asked for it.
          </p>
        )}
        {sonifyMs > 0 && <SonifyBar seconds={Math.round(sonifyMs / 100) / 10} />}
      </div>

      <DirectAsk onStatus={setLocalStatus} />

      <SiteToolsGuide />

      <div className="rail-log">
        <h2 className="rail__heading rail__heading--sub">Tool calls · in plain words</h2>
        <ol
          className="rail-log__list"
          role="log"
          aria-live="polite"
          aria-atomic="false"
          aria-label="Executed tool calls, newest first"
        >
          {newestFirst.length === 0 ? (
            <li className="rail-log__empty">No tools have run yet.</li>
          ) : (
            newestFirst.map((entry) => (
              <ToolCallLine key={`${entry.ts}-${entry.tool}`} entry={entry} />
            ))
          )}
        </ol>
      </div>

      <div className="rail-credo">
        <p className="rail-credo__text">
          Every answer comes from the page’s <strong>own data model</strong> — never a
          screenshot guess.
        </p>
        <p className="rail-credo__sources">Data: NASA GISTEMP · NOAA · Our World in Data</p>
      </div>
    </aside>
  )
}
