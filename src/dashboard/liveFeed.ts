/**
 * liveFeed.ts — the ticking session state behind the "live" ZMW/USD card (4.3).
 *
 * The baseline is REAL (30 daily closes from the fawazahmed0 currency-api). This
 * store replays it forward: starting from the last real close it applies a SMALL
 * bounded random walk on a ~5s tick, so the big number and the sparkline move
 * while staying near ~19. Tick #0 is the real close (the seed), so nothing here
 * ever presents a fabricated number as a real market print — the ticks are a
 * clearly-labelled "simulated feed".
 *
 * Two consumers read this:
 *  - React, via {@link useLiveFeed} (a `useSyncExternalStore` subscription), so
 *    the card re-renders each tick.
 *  - The exchange tool family (`surfaces.ts`), via the non-reactive getters
 *    {@link getCurrentRate}/{@link getSessionStats}/{@link getLiveValues}, so
 *    `current_value`/`session_stats`/`sonify` report the SESSION-LOCAL state —
 *    numbers that exist only in this browsing session and are unknowable to any
 *    offline model.
 *
 * Framework-agnostic core: everything but {@link useLiveFeed} runs under Node,
 * so the pure walk/stat logic is unit-tested in `liveFeed.check.mts`.
 */

import { useSyncExternalStore } from 'react'
import { exchange } from './charts.ts'

/** Tick cadence (ms). ~5s per the 4.3 brief. */
export const TICK_MS = 5000
/** Max per-tick move as a fraction of the last value: ±0.15%. */
export const STEP_PCT = 0.0015
/** Hard clamp band around the seed so the walk stays realistic near ~19: ±10%. */
export const BAND_PCT = 0.1

/** The real last close — tick #0. The whole walk is seeded here. */
const SEED = exchange.points[exchange.points.length - 1].y
/** Lower/upper clamp bounds derived from the seed. */
const LO = SEED * (1 - BAND_PCT)
const HI = SEED * (1 + BAND_PCT)

/** An immutable view of the live feed for React consumers. */
export interface LiveSnapshot {
  /** Latest simulated rate (buffer tail). */
  readonly current: number
  /** Every value this session, starting with the seed (real close) at [0]. */
  readonly buffer: readonly number[]
  /** How many ticks (walk steps) have been applied this session. */
  readonly tickCount: number
  /** Session min/max/range of the rate (over the buffer, seed included). */
  readonly min: number
  readonly max: number
  readonly range: number
  /** Epoch ms of the first `start()`, or `null` before the feed runs. */
  readonly startedAt: number | null
  /** ms since `startedAt` at snapshot time (0 before the feed runs). */
  readonly elapsedMs: number
  /** Whether the interval is currently ticking. */
  readonly running: boolean
  /** The seed (real last close) the session started from. */
  readonly seed: number
  /** Provenance of the real baseline closes. */
  readonly source: string
}

/** The session-local figures the `session_stats`/`current_value` tools narrate. */
export interface SessionStats {
  readonly tickCount: number
  readonly min: number
  readonly max: number
  readonly range: number
  readonly current: number
  readonly elapsedMs: number
  /** Buffer length (seed + ticks). */
  readonly count: number
  readonly seed: number
  readonly source: string
}

// --- Mutable session state (a single app-wide store) ------------------------

let current = SEED
let buffer: number[] = [SEED]
let tickCount = 0
let min = SEED
let max = SEED
let startedAt: number | null = null
let running = false
let timer: ReturnType<typeof setInterval> | null = null

const listeners = new Set<() => void>()

/** Cached immutable snapshot; replaced only when state actually changes. */
let snapshot: LiveSnapshot = buildSnapshot()

function buildSnapshot(): LiveSnapshot {
  return {
    current,
    buffer: buffer.slice(),
    tickCount,
    min,
    max,
    range: max - min,
    startedAt,
    elapsedMs: startedAt === null ? 0 : Date.now() - startedAt,
    running,
    seed: SEED,
    source: exchange.source,
  }
}

function emit(): void {
  snapshot = buildSnapshot()
  for (const l of listeners) l()
}

function clamp(v: number): number {
  return Math.min(HI, Math.max(LO, v))
}

/**
 * Apply ONE bounded random-walk step off the last value and record it. Exposed
 * (not just interval-driven) so the pure logic is Node-testable without timers.
 */
export function tick(): void {
  const pct = (Math.random() * 2 - 1) * STEP_PCT // ∈ (−0.15%, +0.15%)
  const next = clamp(current * (1 + pct))
  current = next
  buffer.push(next)
  tickCount += 1
  if (next < min) min = next
  if (next > max) max = next
  emit()
}

/**
 * Start the ~5s interval. Idempotent (safe under React StrictMode's mount/
 * unmount/mount): a second call while running is a no-op. Returns the matching
 * {@link stopLiveFeed} for effect cleanup.
 */
export function startLiveFeed(): () => void {
  if (running) return stopLiveFeed
  running = true
  if (startedAt === null) startedAt = Date.now()
  // Guard SSR / Node: only arm a real interval where timers exist.
  if (typeof setInterval !== 'undefined') {
    timer = setInterval(tick, TICK_MS)
  }
  emit()
  return stopLiveFeed
}

/** Stop the interval (clears the timer). Session state is preserved. */
export function stopLiveFeed(): void {
  if (timer !== null) {
    clearInterval(timer)
    timer = null
  }
  running = false
  emit()
}

// --- Non-reactive getters (for the exchange tool family) --------------------

/** The current cached snapshot (stable ref between ticks for React). */
export function getLiveSnapshot(): LiveSnapshot {
  return snapshot
}

/** The latest simulated rate, read live at call time. */
export function getCurrentRate(): number {
  return current
}

/** The seed (real last close) the session walks from. */
export function getSeed(): number {
  return SEED
}

/** Genuinely session-local stats, computed fresh (so `elapsedMs` is current). */
export function getSessionStats(): SessionStats {
  return {
    tickCount,
    min,
    max,
    range: max - min,
    current,
    elapsedMs: startedAt === null ? 0 : Date.now() - startedAt,
    count: buffer.length,
    seed: SEED,
    source: exchange.source,
  }
}

/**
 * The full ordered series for sonification: the real baseline closes followed
 * by this session's ticks (the seed is baseline's last close, so it is not
 * duplicated). Before any tick this is exactly the baseline.
 */
export function getLiveValues(): number[] {
  return [...exchange.points.map((p) => p.y), ...buffer.slice(1)]
}

// --- Subscription -----------------------------------------------------------

/** Subscribe to every tick / start / stop. Returns an unsubscribe. */
export function subscribeLiveFeed(cb: () => void): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

/** React binding: re-renders the component on each tick. */
export function useLiveFeed(): LiveSnapshot {
  return useSyncExternalStore(subscribeLiveFeed, getLiveSnapshot, getLiveSnapshot)
}

/**
 * Reset the session to its seed. TEST-ONLY — the app never resets a session
 * (its whole point is that the state accumulates and is unknowable offline).
 */
export function __resetLiveFeedForTests(): void {
  if (timer !== null) {
    clearInterval(timer)
    timer = null
  }
  current = SEED
  buffer = [SEED]
  tickCount = 0
  min = SEED
  max = SEED
  startedAt = null
  running = false
  emit()
}
