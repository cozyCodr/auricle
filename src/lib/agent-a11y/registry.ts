/**
 * registry.ts — the agent-accessibility grammar.
 *
 * A screen reader has exactly ONE focus at a time. This registry ports that
 * interaction model to agents: a small set of GLOBAL orientation tools is
 * always available, and each SURFACE (a chart) owns a family of tools that
 * exists only while that surface is focused. `focus(id)` registers id's family
 * and unregisters every other — so the agent's choices stay scoped to where the
 * user's attention is.
 *
 * Framework-agnostic and safe without WebMCP: when no model context is present,
 * registration is deferred, not dropped. Chrome's flag injects
 * `document.modelContext` before page scripts run, but other hosts (e.g.
 * ChatGPT Site Tools) inject a model context LATE — after load — and may expose
 * it as `navigator.modelContext` instead. So the registry watches for a late
 * host and, the moment one appears, REPLAYS everything it was asked to register
 * (all globals plus the focused surface's family). Under Node/SSR it stays a
 * stateful no-op. The visual dashboard and data tables always work;
 * interviewing the page requires a WebMCP-capable agent host.
 */

import { MirrorBus, type MirrorEvent } from './mirror.ts'
import { LogStore } from './log.ts'

/** A JSON Schema object describing a tool's input parameters. */
export type JSONSchema = Record<string, unknown>

/**
 * A tool result that is *narratable*: a human-speakable sentence with exact
 * figures, optional structured data, and an optional page-mirroring event.
 */
export interface NarratedResult {
  /** A speakable sentence, e.g. "Maize rose 41% from K95 to K134." */
  speech: string
  /** Optional structured payload for programmatic consumers. */
  data?: unknown
  /** Optional event dispatched on the mirror bus so the page reacts. */
  mirror?: MirrorEvent
}

/** Args passed to a tool: the parsed input object from WebMCP. */
export type ToolArgs = Readonly<Record<string, unknown>>

/** A single registrable tool. Framework-agnostic; wrapped for WebMCP internally. */
export interface ToolDef {
  /** Unique tool name (ASCII alphanumeric, `_`, `-`, `.`). */
  name: string
  /** Natural-language description shown to the agent. */
  description: string
  /** JSON Schema for the tool's arguments. */
  inputSchema: JSONSchema
  /** Run the tool and return a narratable result. */
  execute(args: ToolArgs): NarratedResult | Promise<NarratedResult>
  /** Optional override producing the log's short args summary. */
  argsSummary?(args: ToolArgs): string
}

/** A surface (e.g. a chart) and its focus-scoped tool family. */
export interface SurfaceDef {
  /** One-line description of the surface, for orientation tools. */
  describe: string
  /** Tools that exist only while this surface is focused. */
  tools: ToolDef[]
}

/** Where the model context was found. */
export type ConnectionHost = 'document' | 'navigator'

/**
 * Connection lifecycle:
 * - `connected`  — a model context is live; registrations go straight through.
 * - `waiting`    — registrations are stored, awaiting a late-injected host.
 * - `timed-out`  — the watcher gave up (a new registration re-arms it).
 * - `no-host`    — no host seen and no registration attempted yet.
 */
export type ConnectionState = 'connected' | 'waiting' | 'timed-out' | 'no-host'

/** Introspection snapshot for QA (see {@link AgentA11yRegistry.connection}). */
export interface ConnectionInfo {
  state: ConnectionState
  host: ConnectionHost | null
  /** Names of tools whose host registration succeeded and is still live. */
  registered: string[]
  /** Tools whose registration failed even after the no-signal retry. */
  failed: { name: string; error: string }[]
}

/** Tuning knobs for the late-injection watcher (tests inject faster values). */
export interface RegistryOptions {
  /** Poll interval for the connection watcher, ms (default 250). */
  pollIntervalMs?: number
  /** How long the watcher polls before giving up, ms (default 60 000). */
  connectTimeoutMs?: number
}

/** Public shape of the registry (see {@link createRegistry}). */
export interface AgentA11yRegistry {
  registerGlobal(tool: ToolDef): void
  registerSurface(surfaceId: string, def: SurfaceDef): void
  unregisterSurface(surfaceId: string): void
  focus(surfaceId: string): void
  blur(): void
  isAvailable(): boolean
  /** Execute a registered definition locally through the same mirror/log path. */
  executeLocal(toolName: string, args: ToolArgs): Promise<boolean>
  /** QA/debug snapshot of the host connection and per-tool registration status. */
  connection(): ConnectionInfo
  /**
   * Re-check for a model context right now. Connecting replays every stored
   * registration. Called automatically by the watcher; exposed as a manual
   * seam for tests and console debugging. Safe to call at any time.
   */
  pokeConnection(): void
  /** The currently focused surface id, or `null`. */
  readonly focused: string | null
  /** Bus of page-mirroring events emitted by executed tools. */
  readonly mirror: MirrorBus
  /** Ring buffer of executed tool calls. */
  readonly log: LogStore
}

const DEFAULT_POLL_MS = 250
const DEFAULT_CONNECT_TIMEOUT_MS = 60_000

/** Feature-detect a model context on a candidate value. */
function asModelContext(candidate: unknown): WebMCP.ModelContext | null {
  return typeof candidate === 'object' &&
    candidate !== null &&
    typeof (candidate as WebMCP.ModelContext).registerTool === 'function'
    ? (candidate as WebMCP.ModelContext)
    : null
}

/**
 * The live model context, checking BOTH injection points hosts use:
 * `document.modelContext` (Chrome's flag) first, then `navigator.modelContext`
 * (the surface some agent hosts inject instead). SSR/Node-safe.
 */
function getModelContext(): { mc: WebMCP.ModelContext | null; host: ConnectionHost | null } {
  if (typeof document !== 'undefined') {
    const mc = asModelContext((document as Document).modelContext)
    if (mc) return { mc, host: 'document' }
  }
  if (typeof navigator !== 'undefined') {
    const mc = asModelContext(navigator.modelContext)
    if (mc) return { mc, host: 'navigator' }
  }
  return { mc: null, host: null }
}

/** Heuristic: a rejection that means "this tool already exists on the host". */
function isAlreadyRegisteredError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /already|duplicate|exists/i.test(msg)
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** Generic `name(k:v, k2:v2)` summary; `name()` when there are no args. */
function defaultArgsSummary(name: string, args: ToolArgs): string {
  const keys = Object.keys(args ?? {})
  if (keys.length === 0) return `${name}()`
  const body = keys
    .map((k) => {
      const v = args[k]
      return `${k}:${typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v)}`
    })
    .join(', ')
  return `${name}(${body})`
}

/** One host registration attempt for one tool name. */
interface ToolRecord {
  status: 'pending' | 'registered' | 'failed'
  /** The abort signal the HOST registration is tied to; null = not abortable. */
  signal: AbortSignal | null
  error?: string
}

class Registry implements AgentA11yRegistry {
  readonly mirror = new MirrorBus()
  readonly log = new LogStore()

  private readonly globals = new Map<string, ToolDef>()
  private readonly surfaces = new Map<string, SurfaceDef>()
  /** One AbortController per registered family; abort() unregisters it. */
  private readonly globalCtl = new AbortController()
  private focusCtl: AbortController | null = null
  private focusedId: string | null = null

  // --- Connection state -----------------------------------------------------
  private connState: ConnectionState
  private hostKind: ConnectionHost | null
  /** Per-tool host registration status (see {@link ToolRecord}). */
  private readonly toolRecords = new Map<string, ToolRecord>()
  /**
   * NO-SIGNAL DEGRADED MODE. Some hosts reject `registerTool(tool, { signal })`
   * because they do not support abort options. When the one retry WITHOUT the
   * option succeeds, this flips to false and later registrations omit the
   * signal entirely. On such hosts unregistration is impossible: focus swaps
   * still REGISTER the newly focused family, but the previously focused family
   * stays live on the host (its records keep saying 'registered', which is the
   * truth), a name the host already has is not re-sent, and — should a
   * duplicate send still happen — an "already registered"-style rejection is
   * treated as success. On signal-supporting hosts (Chrome) behavior is
   * unchanged: families swap via abort.
   */
  private signalsSupported = true
  private replayAnnounced = false
  private watchTimer: ReturnType<typeof setInterval> | null = null
  private watchTick: (() => void) | null = null
  private watchDeadline = 0
  private readonly pollIntervalMs: number
  private readonly connectTimeoutMs: number

  constructor(opts?: RegistryOptions) {
    this.pollIntervalMs = opts?.pollIntervalMs ?? DEFAULT_POLL_MS
    this.connectTimeoutMs = opts?.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS
    const { mc, host } = getModelContext()
    this.connState = mc ? 'connected' : 'no-host'
    this.hostKind = mc ? host : null
  }

  get focused(): string | null {
    return this.focusedId
  }

  /** Opaque to TS narrowing: `pokeConnection()` mutates `connState`. */
  private isConnected(): boolean {
    return this.connState === 'connected'
  }

  isAvailable(): boolean {
    return getModelContext().mc !== null
  }

  connection(): ConnectionInfo {
    const registered: string[] = []
    const failed: { name: string; error: string }[] = []
    for (const [name, rec] of this.toolRecords) {
      if (rec.status === 'registered') registered.push(name)
      else if (rec.status === 'failed') failed.push({ name, error: rec.error ?? 'unknown error' })
    }
    return { state: this.connState, host: this.hostKind, registered, failed }
  }

  registerGlobal(tool: ToolDef): void {
    if (this.globals.has(tool.name)) return // idempotent — no double-register
    this.globals.set(tool.name, tool)
    this.register(tool, this.globalCtl.signal)
  }

  registerSurface(surfaceId: string, def: SurfaceDef): void {
    this.surfaces.set(surfaceId, def) // store; tools register on focus()
    if (this.focusedId === surfaceId) {
      // Re-registering the focused surface: re-apply its (possibly new) family.
      this.blur()
      this.focus(surfaceId)
    }
  }

  unregisterSurface(surfaceId: string): void {
    if (this.focusedId === surfaceId) this.blur()
    this.surfaces.delete(surfaceId)
  }

  focus(surfaceId: string): void {
    if (this.focusedId === surfaceId) return // idempotent re-focus
    const surface = this.surfaces.get(surfaceId)
    if (!surface) return
    this.blur() // unregister the previously focused family
    this.focusCtl = new AbortController()
    this.focusedId = surfaceId
    for (const tool of surface.tools) this.register(tool, this.focusCtl.signal)
  }

  blur(): void {
    if (this.focusCtl) {
      this.focusCtl.abort() // unregisters every tool in the family
      this.focusCtl = null
    }
    this.focusedId = null
  }

  async executeLocal(toolName: string, args: ToolArgs): Promise<boolean> {
    const global = this.globals.get(toolName)
    const focusedSurface = this.focusedId ? this.surfaces.get(this.focusedId) : undefined
    const def = global ?? focusedSurface?.tools.find((tool) => tool.name === toolName)
    if (!def) return false
    await this.executeDefinition(def, args)
    return true
  }

  pokeConnection(): void {
    if (this.connState === 'connected') return
    const { mc, host } = getModelContext()
    if (mc && host) {
      const hadDeferred = this.globals.size > 0 || this.focusedId !== null
      this.connState = 'connected'
      this.hostKind = host
      this.stopWatcher()
      if (hadDeferred) this.replay(host)
    } else if (this.watchTimer !== null && Date.now() >= this.watchDeadline) {
      this.stopWatcher()
      this.connState = 'timed-out'
    }
  }

  /** One execution path for browser-agent calls and the deterministic demo. */
  private async executeDefinition(def: ToolDef, input: ToolArgs): Promise<NarratedResult> {
    const result = await def.execute(input)
    if (result.mirror) this.mirror.emit(result.mirror)
    this.log.append({
      tool: def.name,
      argsSummary: def.argsSummary
        ? def.argsSummary(input)
        : defaultArgsSummary(def.name, input),
      speech: result.speech,
      ts: Date.now(),
    })
    return result
  }

  /**
   * Wrap a {@link ToolDef} into a WebMCP tool and register it under `signal`.
   * With no host present, the attempt is DEFERRED (not dropped): the registry
   * flips to 'waiting' and a connection watcher replays all stored state the
   * moment a model context appears. Returns true when a host registration was
   * actually initiated by THIS call.
   */
  private register(def: ToolDef, signal: AbortSignal): boolean {
    if (!this.isConnected()) {
      // A host may have appeared since we last looked. A successful poke
      // replays every stored tool (this one included, since callers store
      // state before registering) — so either way this call is covered.
      this.pokeConnection()
      if (!this.isConnected()) this.ensureWatcher()
      return false
    }
    if (signal.aborted) return false
    const existing = this.toolRecords.get(def.name)
    if (
      existing &&
      existing.status !== 'failed' &&
      (existing.signal === null || !existing.signal.aborted)
    ) {
      return false // this name is already live (or in flight) on the host
    }
    const { mc } = getModelContext()
    if (!mc) {
      // Host vanished between checks (defensive): fall back to waiting.
      this.connState = 'waiting'
      this.hostKind = null
      this.ensureWatcher()
      return false
    }
    const wrapped: WebMCP.ModelContextTool = {
      name: def.name,
      description: def.description,
      inputSchema: def.inputSchema,
      execute: async (args) => {
        const input = (args ?? {}) as ToolArgs
        const result = await this.executeDefinition(def, input)
        return { content: [{ type: 'text', text: result.speech }] }
      },
    }
    const rec: ToolRecord = { status: 'pending', signal }
    this.toolRecords.set(def.name, rec)
    void this.initiateRegistration(mc, def.name, wrapped, signal, rec)
    return true
  }

  /**
   * Await one host registration, Promise.allSettled-style: every path is
   * caught, nothing rejects unhandled. A rejection of the attempt made WITH
   * `{ signal }` is retried ONCE without the option (see the no-signal mode
   * note on {@link signalsSupported}).
   */
  private async initiateRegistration(
    mc: WebMCP.ModelContext,
    name: string,
    wrapped: WebMCP.ModelContextTool,
    signal: AbortSignal,
    rec: ToolRecord,
  ): Promise<void> {
    // A newer registration for this name may replace `rec`; stale attempts
    // must not clobber the newer record.
    const isCurrent = (): boolean => this.toolRecords.get(name) === rec
    const markRegistered = (abortable: boolean): void => {
      if (!isCurrent()) return
      rec.error = undefined
      rec.signal = abortable ? signal : null
      if (abortable && signal.aborted) {
        this.toolRecords.delete(name) // aborted while in flight; host dropped it
        return
      }
      rec.status = 'registered'
      if (abortable) {
        signal.addEventListener(
          'abort',
          () => {
            if (isCurrent()) this.toolRecords.delete(name)
          },
          { once: true },
        )
      }
    }
    const markFailed = (err: unknown): void => {
      if (!isCurrent()) return
      rec.status = 'failed'
      rec.error = errorMessage(err)
    }
    if (!this.signalsSupported) {
      try {
        await mc.registerTool(wrapped)
        markRegistered(false)
      } catch (err) {
        if (isAlreadyRegisteredError(err)) markRegistered(false)
        else markFailed(err)
      }
      return
    }
    try {
      await mc.registerTool(wrapped, { signal })
      markRegistered(true)
    } catch (errWithSignal) {
      if (signal.aborted) {
        // Intentional unregistration raced the in-flight registration.
        if (isCurrent()) this.toolRecords.delete(name)
        return
      }
      try {
        await mc.registerTool(wrapped) // retry once without the abort option
        this.signalsSupported = false
        markRegistered(false)
      } catch (errWithout) {
        if (isAlreadyRegisteredError(errWithout)) markRegistered(false)
        else markFailed(errWithout ?? errWithSignal)
      }
    }
  }

  /** A host appeared late: re-register every stored global + the focused family. */
  private replay(host: ConnectionHost): void {
    let count = 0
    for (const tool of this.globals.values()) {
      if (this.register(tool, this.globalCtl.signal)) count++
    }
    if (this.focusedId) {
      const surface = this.surfaces.get(this.focusedId)
      if (surface) {
        if (!this.focusCtl) this.focusCtl = new AbortController()
        for (const tool of surface.tools) {
          if (this.register(tool, this.focusCtl.signal)) count++
        }
      }
    }
    if (count > 0 && !this.replayAnnounced && typeof window !== 'undefined') {
      this.replayAnnounced = true
      console.info(
        `agent-a11y: model context appeared late (${host}); replayed ${count} tool${count === 1 ? '' : 's'}`,
      )
    }
  }

  /**
   * Start watching for a late-injected model context (browser only): poll
   * every {@link pollIntervalMs} for up to {@link connectTimeoutMs}, plus
   * cheap re-checks when the tab becomes visible/focused. Under Node/SSR the
   * registry just stays 'waiting'; `pokeConnection()` is the manual seam.
   */
  private ensureWatcher(): void {
    if (this.connState === 'connected') return
    this.connState = 'waiting'
    if (this.watchTimer !== null) return // already watching
    if (typeof window === 'undefined') return // Node/SSR: stateful no-op
    this.watchDeadline = Date.now() + this.connectTimeoutMs
    const tick = (): void => this.pokeConnection()
    this.watchTick = tick
    this.watchTimer = setInterval(tick, this.pollIntervalMs)
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', tick)
    window.addEventListener('focus', tick)
  }

  private stopWatcher(): void {
    if (this.watchTimer !== null) {
      clearInterval(this.watchTimer)
      this.watchTimer = null
    }
    if (this.watchTick) {
      if (typeof document !== 'undefined')
        document.removeEventListener('visibilitychange', this.watchTick)
      if (typeof window !== 'undefined') window.removeEventListener('focus', this.watchTick)
      this.watchTick = null
    }
  }
}

/** Create an isolated registry (tests, or multiple independent roots). */
export function createRegistry(opts?: RegistryOptions): AgentA11yRegistry {
  return new Registry(opts)
}

/** The default app-wide registry used by the React hooks in `react.ts`. */
export const registry: AgentA11yRegistry = createRegistry()
