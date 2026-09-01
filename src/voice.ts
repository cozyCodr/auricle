/**
 * voice.ts — in-page push-to-talk voice input (Web Speech API).
 *
 * This is the *input modality* for Auricle's demo, not the product's brain. It
 * transcribes a spoken question into text so it can (a) land in the conversation
 * strip as the user's question and (b) feed the local demo-intent matcher
 * (`src/voice/intents.ts`). The PRIMARY interaction model is still an external
 * WebMCP agent (ChatGPT Atlas / Chrome + Gemini) calling the registered tools;
 * voice + the matcher exist so the loop is demonstrable standalone and so the
 * dashboard is reachable by voice for accessibility.
 *
 * Web Speech is Chrome/WebKit-only and behind a vendor prefix, so everything is
 * feature-detected: `isVoiceSupported()` gates the whole feature and the header
 * mic is hidden when it returns false. The app is fully usable without it.
 */

// --- Minimal Web Speech typings (not in the default TS DOM lib) -------------

interface SpeechRecognitionAlternativeLike {
  readonly transcript: string
}
interface SpeechRecognitionResultLike {
  readonly isFinal: boolean
  readonly length: number
  [index: number]: SpeechRecognitionAlternativeLike
}
interface SpeechRecognitionResultListLike {
  readonly length: number
  [index: number]: SpeechRecognitionResultLike
}
interface SpeechRecognitionEventLike {
  readonly resultIndex: number
  readonly results: SpeechRecognitionResultListLike
}
interface SpeechRecognitionErrorEventLike {
  readonly error: string
  readonly message?: string
}
interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start(): void
  stop(): void
  abort(): void
  onresult: ((e: SpeechRecognitionEventLike) => void) | null
  onerror: ((e: SpeechRecognitionErrorEventLike) => void) | null
  onend: (() => void) | null
  onstart: (() => void) | null
}
interface SpeechRecognitionCtor {
  new (): SpeechRecognitionLike
}

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

/**
 * True when this browser exposes the Web Speech recognition API. The header mic
 * must be HIDDEN when this is false — the app stays fully usable without it.
 */
export function isVoiceSupported(): boolean {
  return getRecognitionCtor() !== null
}

/** The push-to-talk lifecycle, surfaced to the UI via `onStateChange`. */
export type VoiceState =
  | 'unsupported' // no Web Speech API in this browser
  | 'idle' // ready; not listening
  | 'listening' // mic open, capturing speech
  | 'denied' // user (or policy) blocked mic permission
  | 'error' // a recognition error other than permission

export interface VoiceCallbacks {
  /** Live (non-final) transcript, for the pill to show what's being heard. */
  onInterim?(text: string): void
  /** Fires once with the final recognized string when an utterance completes. */
  onFinal(text: string): void
  /** Every lifecycle transition, so the UI can reflect idle/listening/denied. */
  onStateChange?(state: VoiceState): void
}

export interface VoiceController {
  /** Open the mic and begin recognition (first use prompts for permission). */
  start(): void
  /** Stop recognition; any in-flight final result still fires. */
  stop(): void
  /** Start if idle, stop if listening — the push-to-talk click handler. */
  toggle(): void
  /** Current lifecycle state (non-reactive read). */
  readonly state: VoiceState
}

/**
 * Create a push-to-talk voice controller.
 *
 * Push-to-talk = click to start, click to stop; a single utterance also
 * auto-stops on its final result (`continuous = false`). `interimResults` is on
 * so the pill can show live text. Recognition is created fresh per `start()` so
 * a denied/errored session can be retried cleanly. Permission is browser-gated:
 * the first `start()` prompts, and a `not-allowed` error surfaces as `denied`.
 */
export function createVoice(cb: VoiceCallbacks): VoiceController {
  const Ctor = getRecognitionCtor()
  let state: VoiceState = Ctor ? 'idle' : 'unsupported'
  let rec: SpeechRecognitionLike | null = null
  let finalText = ''

  function setState(next: VoiceState): void {
    if (next === state) return
    state = next
    cb.onStateChange?.(state)
  }

  function start(): void {
    if (!Ctor) {
      setState('unsupported')
      return
    }
    if (state === 'listening') return
    finalText = ''
    const r = new Ctor()
    rec = r
    r.lang = 'en-US'
    r.continuous = false // one utterance, then auto-stop
    r.interimResults = true // live text for the pill
    r.maxAlternatives = 1

    r.onstart = () => setState('listening')

    r.onresult = (e) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i]
        const alt = result[0]
        if (!alt) continue
        if (result.isFinal) finalText += alt.transcript
        else interim += alt.transcript
      }
      if (interim) cb.onInterim?.(interim)
    }

    r.onerror = (e) => {
      // Permission denials get their own state so the UI can explain how to fix.
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        setState('denied')
      } else if (e.error === 'no-speech' || e.error === 'aborted') {
        // Benign: user stopped or said nothing — fall back to idle on `onend`.
      } else {
        setState('error')
      }
    }

    r.onend = () => {
      rec = null
      const text = finalText.trim()
      // Only reset to idle if we're not parked on a denied/error state.
      if (state === 'listening') setState('idle')
      if (text) cb.onFinal(text)
    }

    try {
      r.start()
    } catch {
      // `start()` throws if called while already active; treat as a no-op.
      rec = null
    }
  }

  function stop(): void {
    if (rec) rec.stop()
  }

  function toggle(): void {
    if (state === 'listening') stop()
    else start()
  }

  return {
    start,
    stop,
    toggle,
    get state() {
      return state
    },
  }
}
