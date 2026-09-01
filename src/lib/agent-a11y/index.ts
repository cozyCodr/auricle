/**
 * agent-a11y — the agent-accessibility grammar for Auricle.
 *
 * A screen-reader focus model for AI agents: always-on global orientation
 * tools plus focus-scoped surface families, every result narratable and
 * mirrorable. Framework-agnostic core, with optional React hooks.
 */

export { createRegistry, registry } from './registry.ts'
export type {
  AgentA11yRegistry,
  JSONSchema,
  NarratedResult,
  SurfaceDef,
  ToolArgs,
  ToolDef,
} from './registry.ts'
export { MirrorBus } from './mirror.ts'
export type { MirrorEvent, MirrorHandler } from './mirror.ts'
export { LogStore } from './log.ts'
export type { LogEntry } from './log.ts'
export {
  useAgentAvailable,
  useMirror,
  useSurface,
  useToolLog,
} from './react.ts'
