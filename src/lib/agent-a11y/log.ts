/**
 * log.ts — a subscribable ring buffer of the last N executed tool calls.
 *
 * Every tool the agent runs appends one {@link LogEntry}. The store keeps an
 * immutable snapshot so it plugs straight into React's `useSyncExternalStore`
 * (`getSnapshot` is referentially stable between mutations).
 */

/** One executed tool call, as shown in the conversation rail. */
export interface LogEntry {
  /** Tool name, e.g. `describe_screen`. */
  readonly tool: string
  /** Short human summary of the args, e.g. `focus_chart(maize-prices)`. */
  readonly argsSummary: string
  /** The speakable sentence the tool returned. */
  readonly speech: string
  /** `Date.now()` at execution. */
  readonly ts: number
}

const CAPACITY = 50

/** Ring buffer of the most recent {@link LogEntry} values (last {@link CAPACITY}). */
export class LogStore {
  private snapshot: readonly LogEntry[] = []
  private readonly listeners = new Set<() => void>()

  append(entry: LogEntry): void {
    const next = [...this.snapshot, entry]
    if (next.length > CAPACITY) next.splice(0, next.length - CAPACITY)
    this.snapshot = next
    for (const listener of this.listeners) listener()
  }

  /** Subscribe to changes; returns an unsubscribe function. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** Stable snapshot of all entries — safe for `useSyncExternalStore`. */
  getSnapshot(): readonly LogEntry[] {
    return this.snapshot
  }

  /** Drop all entries (used by tests). */
  clear(): void {
    this.snapshot = []
    for (const listener of this.listeners) listener()
  }
}
