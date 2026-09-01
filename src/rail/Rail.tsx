/**
 * Rail — the right-hand conversation + tool-activity rail (item 3.3).
 *
 * Top → bottom, matching the mockup:
 *   1. "Conversation" heading + a demo text input (display-only stand-in for the
 *      spoken question; item 4.2 will feed the same slot from speech).
 *   2. The latest question as a dark bubble (italic), when one has been asked.
 *   3. The latest agent-facing answer as a light bubble — the `speech` of the
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
import { useMirror, useToolLog } from '../lib/agent-a11y'
import type { LogEntry } from '../lib/agent-a11y'
import { setQuestion, useQuestion } from './conversation.ts'

/** Small microphone glyph, reused in the header/question bubble. */
function MicIcon({ stroke, size = 15 }: { stroke: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
      className="rail-q__icon"
    >
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3" />
    </svg>
  )
}

/** The demo text input: a display-only stand-in for the spoken question. */
function QuestionInput() {
  const [draft, setDraft] = useState('')
  const inputId = useId()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const text = draft.trim()
    if (!text) return
    setQuestion(text)
    setDraft('')
  }

  return (
    <form className="rail-ask" onSubmit={submit}>
      <label htmlFor={inputId} className="sr-only">
        Type a question to show it in the conversation (demo)
      </label>
      <input
        id={inputId}
        className="rail-ask__input"
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Type a question to show it here (demo)"
        autoComplete="off"
      />
      <button type="submit" className="rail-ask__btn">
        Ask
      </button>
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
      <h2 className="rail__heading">Conversation</h2>

      <QuestionInput />

      {question && (
        <div className="rail-q">
          <MicIcon stroke="#e8c778" />
          <p className="rail-q__text">“{question}”</p>
        </div>
      )}

      <div className="rail-a" role="status" aria-live="polite" aria-atomic="true">
        {latestAnswer ? (
          <p className="rail-a__text">{latestAnswer}</p>
        ) : (
          <p className="rail-a__text rail-a__text--empty">
            Ask a chart a question through your agent.
          </p>
        )}
        {sonifyMs > 0 && <SonifyBar seconds={Math.round(sonifyMs / 100) / 10} />}
      </div>

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
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--ink)"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
          className="rail-credo__icon"
        >
          <path d="M12 3 4 6v6c0 4.4 3.4 8 8 9 4.6-1 8-4.6 8-9V6l-8-3z" />
        </svg>
        <p className="rail-credo__text">
          Every answer comes from the page’s <strong>own data model</strong> — never a
          screenshot guess.
        </p>
      </div>
    </aside>
  )
}
