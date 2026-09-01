/**
 * WebMCP ambient types for Auricle.
 *
 * The `webmcp-types` package (dev dependency) declares the global
 * `document.modelContext` via the `WebMCP` namespace. That package is NOT an
 * `@types/*` package and tsconfig pins `types: ["vite/client"]`, so its ambient
 * global would not be picked up automatically. The reference below pulls it in.
 *
 * The package's `ModelContext` interface covers `registerTool`, `getTools`, and
 * `ontoolchange`, but does not declare an imperative `executeTool`. We augment
 * it here (optionally) so feature-detecting code that drives a tool by name
 * typechecks. Everything stays optional so `document.modelContext?.…`
 * feature-detection is required at call sites.
 */

/// <reference types="webmcp-types" />

declare namespace WebMCP {
  interface ModelContext {
    /**
     * Imperatively execute a registered tool by reference or name.
     * @param tool The tool (or its name) to execute.
     * @param argsJsonString The tool arguments encoded as a JSON string.
     */
    executeTool?(tool: RegisteredTool | string, argsJsonString: string): Promise<unknown>
  }
}

/**
 * Fallback declaration: if `webmcp-types` is ever absent, this still gives the
 * app a minimally-typed, optional `document.modelContext`. When the package is
 * present its richer `WebMCP.ModelContext` wins via declaration merging.
 */
interface Document {
  readonly modelContext?: WebMCP.ModelContext
}
