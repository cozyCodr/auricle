/**
 * dashboard — integration surface for Auricle's agent tools.
 *
 * `registerDashboard()` wires the agent layer in one call: the five global
 * tools (describe_screen, list_visualizations, create_view, clear_workspace,
 * focus_chart). NO chart surfaces are registered at boot — in the workspace
 * arc a surface (and its tool family) is born only when `create_view` / a
 * shelf click commissions its view (see workspace.ts), and dies again on
 * `clear_workspace`.
 */

import { registerOrientationTools } from './orientation.ts'

let registered = false

/**
 * Register the global orientation + workspace tools.
 * Idempotent — safe to call once at app start (and a no-op without WebMCP).
 */
export function registerDashboard(): void {
  if (registered) return
  registered = true
  registerOrientationTools()
}

export { CHARTS, CHART_IDS, getChart, DATASETS } from './charts.ts'
export type { ChartMeta, ChartKind } from './charts.ts'
export { registerOrientationTools } from './orientation.ts'
export { buildSurface, surfaceFor, toolNamesFor, toolCountFor } from './surfaces.ts'
export { setFocus, getFocus, initFocus, useFocusedChart, DEFAULT_FOCUS } from './focus.ts'
export {
  commissionView,
  clearWorkspace,
  getWorkspace,
  getWorkspaceIds,
  isCommissioned,
  refreshLiveSurface,
  useWorkspace,
} from './workspace.ts'
export type { WorkspaceView } from './workspace.ts'
