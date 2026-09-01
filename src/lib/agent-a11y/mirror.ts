/**
 * mirror.ts — a tiny typed event bus for "page mirroring".
 *
 * When an agent tool answers a question, it can carry a `MirrorEvent` so the
 * page paints what was asked/answered (highlight a range, move a cursor, …).
 * The bus is framework-agnostic; React glue lives in `react.ts`.
 */

/**
 * A page-mirroring event. Kept intentionally OPEN: every event has a string
 * `kind` discriminant, and carries arbitrary extra fields. Work item 3.2
 * narrows this with concrete kinds (e.g. `highlight-range`, `move-cursor`).
 */
export type MirrorEvent = { readonly kind: string } & Record<string, unknown>

/** A subscriber invoked with each dispatched {@link MirrorEvent}. */
export type MirrorHandler = (event: MirrorEvent) => void

/** Minimal synchronous pub/sub. `subscribe` returns an unsubscribe function. */
export class MirrorBus {
  private readonly handlers = new Set<MirrorHandler>()

  subscribe(handler: MirrorHandler): () => void {
    this.handlers.add(handler)
    return () => {
      this.handlers.delete(handler)
    }
  }

  emit(event: MirrorEvent): void {
    for (const handler of this.handlers) handler(event)
  }
}
