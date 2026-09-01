/**
 * dashboard — integration surface for Auricle's agent tools.
 *
 * `registerDashboard()` wires the whole agent layer in one call: the three
 * global orientation tools, plus a focusable surface per chart so
 * `focus_chart` can actually swap tool families. Registering surfaces at
 * module scope (rather than only via React `useSurface`) means focus works
 * even before any chart component mounts — 3.1 can render the visuals on top
 * without changing this contract.
 */

import { registry } from '../lib/agent-a11y'
import { CHARTS } from './charts.ts'
import { CHART_SURFACES } from './surfaces.ts'
import { registerOrientationTools } from './orientation.ts'

let registered = false

/**
 * Register the global orientation tools and the four chart surfaces.
 * Idempotent — safe to call once at app start (and a no-op without WebMCP).
 */
export function registerDashboard(): void {
  if (registered) return
  registered = true
  registerOrientationTools()
  for (const chart of CHARTS) {
    registry.registerSurface(chart.id, CHART_SURFACES[chart.id])
  }
}

export { CHARTS, getChart } from './charts.ts'
export { registerOrientationTools } from './orientation.ts'
export { CHART_SURFACES, toolNamesFor, toolCountFor } from './surfaces.ts'
