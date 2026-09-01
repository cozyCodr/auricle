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
 * Framework-agnostic and safe without WebMCP: when `document.modelContext` is
 * absent, every method is a no-op and the app stays fully usable.
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

/** Public shape of the registry (see {@link createRegistry}). */
export interface AgentA11yRegistry {
  registerGlobal(tool: ToolDef): void
  registerSurface(surfaceId: string, def: SurfaceDef): void
  unregisterSurface(surfaceId: string): void
  focus(surfaceId: string): void
  blur(): void
  isAvailable(): boolean
  /** The currently focused surface id, or `null`. */
  readonly focused: string | null
  /** Bus of page-mirroring events emitted by executed tools. */
  readonly mirror: MirrorBus
  /** Ring buffer of executed tool calls. */
  readonly log: LogStore
}

/** WebMCP's `document.modelContext`, or `null` when the flag is off. */
function getModelContext(): WebMCP.ModelContext | null {
  if (typeof document === 'undefined') return null
  const mc = (document as Document).modelContext
  return typeof mc === 'object' && mc !== null ? mc : null
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

class Registry implements AgentA11yRegistry {
  readonly mirror = new MirrorBus()
  readonly log = new LogStore()

  private readonly globals = new Map<string, ToolDef>()
  private readonly surfaces = new Map<string, SurfaceDef>()
  /** One AbortController per registered family; abort() unregisters it. */
  private readonly globalCtl = new AbortController()
  private focusCtl: AbortController | null = null
  private focusedId: string | null = null

  get focused(): string | null {
    return this.focusedId
  }

  isAvailable(): boolean {
    return getModelContext() !== null
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

  /** Wrap a {@link ToolDef} into a WebMCP tool and register it under `signal`. */
  private register(def: ToolDef, signal: AbortSignal): void {
    const mc = getModelContext()
    if (!mc) return // graceful no-op without the WebMCP flag
    const wrapped: WebMCP.ModelContextTool = {
      name: def.name,
      description: def.description,
      inputSchema: def.inputSchema,
      execute: async (args) => {
        const input = (args ?? {}) as ToolArgs
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
        return { content: [{ type: 'text', text: result.speech }] }
      },
    }
    void mc.registerTool(wrapped, { signal })
  }
}

/** Create an isolated registry (tests, or multiple independent roots). */
export function createRegistry(): AgentA11yRegistry {
  return new Registry()
}

/** The default app-wide registry used by the React hooks in `react.ts`. */
export const registry: AgentA11yRegistry = createRegistry()
