/**
 * conversation.ts — the reactive "latest question" slot for the rail.
 *
 * The conversation area shows the most recent question posed to the dashboard.
 * There is no WebMCP channel that hands us the agent's natural-language question
 * (tools only receive structured args), so the question is written by the UI:
 *
 *  - item 3.3 (this rail) writes it from a small demo text input, and
 *  - item 4.2 (voice) will write it from speech recognition.
 *
 * Both paths call the single writer `setQuestion(text)`. This is a thin
 * `useSyncExternalStore`-compatible store (the same pattern as `focus.ts`), kept
 * separate from agent-a11y so voice input in 4.2 is a clean drop-in: import
 * `setQuestion` and call it with the recognized transcript.
 */

import { useSyncExternalStore } from 'react'

let question = ''
const listeners = new Set<() => void>()

function emit(): void {
  for (const l of listeners) l()
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

function getSnapshot(): string {
  return question
}

/**
 * Set the latest question shown in the conversation area. Single writer for both
 * the demo text input (3.3) and voice recognition (4.2). Trims whitespace; an
 * all-blank string clears the slot.
 */
export function setQuestion(text: string): void {
  const next = text.trim()
  if (next === question) return
  question = next
  emit()
}

/** Current question (non-reactive read). */
export function getQuestion(): string {
  return question
}

/** Clear the question slot. */
export function clearQuestion(): void {
  setQuestion('')
}

/** Reactive hook: the latest question, re-rendering whenever it changes. */
export function useQuestion(): string {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
