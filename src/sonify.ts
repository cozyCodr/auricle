/**
 * sonify.ts — Web Audio pitch-mapped sonification of a numeric series (item 4.1).
 *
 * The "hear the shape" leg of Auricle's accessibility story: any ordered numeric
 * series is swept as a rising/falling tone. Values map LINEARLY across the
 * series min→max to 220–880 Hz; the whole sweep lasts ~3 seconds regardless of
 * length (so a 115-point series and a 25-point one both take about the same
 * time); the series MAX gets a louder note plus a brief octave-up ping so the
 * peak is audibly distinct. Per-note attack/release envelopes (never a hard 0)
 * keep it click-free.
 *
 * Browser audio needs a user gesture, so a single shared AudioContext is created
 * lazily and `armAudio()` (called from a button click) resumes it. Until then
 * `isAudioReady()` is false and callers should surface the "Enable sound" prompt
 * instead of playing.
 *
 * IMPORTANT: the top level of this module touches NO browser globals — every
 * `window`/`AudioContext` reference lives inside a function — so the pure
 * mapping helpers (`valueToFreq`, `peakIndex`, `downsample`, `stepMs`) can be
 * unit-tested under Node (see `sonify.check.mts`).
 */

/** Low end of the pitch map — the series minimum plays here. */
export const FREQ_MIN = 220
/** High end of the pitch map — the series maximum plays here. */
export const FREQ_MAX = 880
/** Target total sweep duration (ms); kept inside the 2.5–3.5s brief. */
export const DURATION_MS = 3000
/** Long series are down-sampled to at most this many steps for listenability. */
export const MAX_STEPS = 72

// --- Pure mapping helpers (Node-testable; no browser globals) ---------------

/**
 * Map one value linearly across [min, max] → [FREQ_MIN, FREQ_MAX]. A flat
 * series (max === min) has no gradient, so it plays at the mid frequency.
 */
export function valueToFreq(value: number, min: number, max: number): number {
  if (max === min) return (FREQ_MIN + FREQ_MAX) / 2
  const t = (value - min) / (max - min)
  return FREQ_MIN + t * (FREQ_MAX - FREQ_MIN)
}

/** Index of the first maximum in a series (the note that gets the peak ping). */
export function peakIndex(values: readonly number[]): number {
  let idx = 0
  for (let i = 1; i < values.length; i++) if (values[i] > values[idx]) idx = i
  return idx
}

/** Per-step time in ms for `n` steps across `totalMs` of playback. */
export function stepMs(n: number, totalMs: number = DURATION_MS): number {
  return totalMs / Math.max(1, n)
}

/**
 * Down-sample a long series to at most `maxSteps` evenly-spaced samples so a
 * 115-point series stays listenable at ~3s. The shape is preserved by even
 * decimation, and the TRUE peak is preserved explicitly: the output step whose
 * source index lands nearest the real maximum is overwritten with the real
 * maximum value, so the loud octave ping still fires at the right value and the
 * right position in time. Series already ≤ maxSteps are returned unchanged.
 */
export function downsample(values: readonly number[], maxSteps: number = MAX_STEPS): number[] {
  const n = values.length
  if (n <= maxSteps) return values.slice()
  const srcPeak = peakIndex(values)
  const out: number[] = []
  let outPeakStep = 0
  let bestDist = Infinity
  for (let i = 0; i < maxSteps; i++) {
    const src = Math.round((i * (n - 1)) / (maxSteps - 1))
    out.push(values[src])
    const d = Math.abs(src - srcPeak)
    if (d < bestDist) {
      bestDist = d
      outPeakStep = i
    }
  }
  out[outPeakStep] = values[srcPeak] // keep the true max audible at its ~time
  return out
}

// --- AudioContext lifecycle (browser only) ----------------------------------

type AudioCtor = typeof AudioContext

let ctx: AudioContext | null = null
const armListeners = new Set<() => void>()

function notifyArm(): void {
  for (const cb of armListeners) cb()
}

/** Resolve the AudioContext constructor across vendor prefixes, or null. */
function getCtor(): AudioCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor }
  return w.AudioContext ?? w.webkitAudioContext ?? null
}

/** The shared context, created lazily. Returns null if Web Audio is absent. */
function ensureCtx(): AudioContext | null {
  if (ctx) return ctx
  const Ctor = getCtor()
  if (!Ctor) return null
  ctx = new Ctor()
  return ctx
}

/**
 * Subscribe to arm-state changes (context created / resumed). Returns an
 * unsubscribe fn. Lets the "Enable sound" button re-render when audio arms.
 */
export function subscribeAudio(cb: () => void): () => void {
  armListeners.add(cb)
  return () => {
    armListeners.delete(cb)
  }
}

/** `true` once the shared context exists and is running (audio can play now). */
export function isAudioReady(): boolean {
  return ctx !== null && ctx.state === 'running'
}

/**
 * Arm audio. MUST be called from a user gesture (e.g. a button click): it
 * creates the shared context if needed and resumes it. Safe to call repeatedly.
 */
export async function armAudio(): Promise<void> {
  const c = ensureCtx()
  if (!c) return
  if (c.state === 'suspended') {
    try {
      await c.resume()
    } catch {
      /* resume rejects when not driven by a gesture; caller stays un-armed */
    }
  }
  notifyArm()
}

// --- Playback ---------------------------------------------------------------

export interface SonifyOptions {
  /** Total sweep duration in ms (default {@link DURATION_MS}). */
  totalMs?: number
  /** Max steps before down-sampling (default {@link MAX_STEPS}). */
  maxSteps?: number
}

export interface SonifyHandle {
  /** Total wall-clock duration of the animation/playback in ms. */
  durationMs: number
  /** Output step index that carries the peak ping. */
  peakStep: number
  /** The peak value that plays loudest (the true series max). */
  peakValue: number
  /** How many notes actually played (post down-sample). */
  steps: number
  /** Resolves when playback has finished. */
  done: Promise<void>
}

/**
 * Play `rawValues` as a pitch-mapped sweep on the shared AudioContext. Assumes
 * the context is armed (callers gate on {@link isAudioReady}); if the context
 * is missing it resolves immediately with a zero-length handle rather than
 * throwing. Returns synchronously with timing so the UI can animate for exactly
 * `durationMs`.
 */
export function sonifySeries(rawValues: readonly number[], opts: SonifyOptions = {}): SonifyHandle {
  const totalMs = opts.totalMs ?? DURATION_MS
  const values = downsample(rawValues, opts.maxSteps ?? MAX_STEPS)
  const n = values.length
  const pk = peakIndex(values)
  const c = ensureCtx()

  if (!c || n === 0) {
    return { durationMs: 0, peakStep: pk, peakValue: values[pk] ?? 0, steps: n, done: Promise.resolve() }
  }

  const min = Math.min(...values)
  const max = Math.max(...values)
  const stepS = stepMs(n, totalMs) / 1000
  // Glissando envelopes: one continuous voice, so the edges can breathe.
  const attack = 0.04
  const release = 0.12

  const master = c.createGain()
  master.gain.value = 0.9
  master.connect(c.destination)

  const now = c.currentTime + 0.02 // tiny lead-in so the sweep never clips
  const FLOOR = 0.0001 // exponential ramps can't reach 0 — ramp to a floor instead
  const norm = (v: number) => (max === min ? 0.5 : (v - min) / (max - min))

  // ONE continuous voice gliding through every value — a rising line, not a
  // zipper of notes — with a crescendo that tracks the value itself: cold
  // decades whisper (~0.12), the climb swells toward the maximum (~0.85). The
  // drama IS the data: quiet wobble, then the surge.
  const osc = c.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(valueToFreq(values[0], min, max), now)
  const g = c.createGain()
  g.gain.setValueAtTime(FLOOR, now)
  g.gain.exponentialRampToValueAtTime(Math.max(0.12, 0.12 + 0.73 * norm(values[0])), now + attack)
  for (let i = 1; i < n; i++) {
    const t = now + i * stepS
    osc.frequency.linearRampToValueAtTime(valueToFreq(values[i], min, max), t)
    g.gain.linearRampToValueAtTime(0.12 + 0.73 * norm(values[i]), t)
  }
  const tEnd = now + (n - 1) * stepS
  g.gain.exponentialRampToValueAtTime(FLOOR, tEnd + release)
  osc.connect(g)
  g.connect(master)
  osc.start(now)
  osc.stop(tEnd + release + 0.05)

  // The maximum stays unmistakable: an octave-up triangle ping at the peak's
  // moment in time, ringing slightly longer than before.
  const tPeak = now + pk * stepS
  const peakFreq = valueToFreq(values[pk], min, max)
  const ping = c.createOscillator()
  ping.type = 'triangle'
  ping.frequency.setValueAtTime(peakFreq * 2, tPeak)
  const pg = c.createGain()
  pg.gain.setValueAtTime(FLOOR, tPeak)
  pg.gain.exponentialRampToValueAtTime(0.55, tPeak + 0.02)
  pg.gain.exponentialRampToValueAtTime(FLOOR, tPeak + 0.45)
  ping.connect(pg)
  pg.connect(master)
  ping.start(tPeak)
  ping.stop(tPeak + 0.5)

  const durationMs = totalMs + release * 1000 + 60
  const done = new Promise<void>((resolve) => {
    if (typeof window !== 'undefined') window.setTimeout(resolve, durationMs)
    else resolve()
  })
  return { durationMs, peakStep: pk, peakValue: values[pk], steps: n, done }
}
