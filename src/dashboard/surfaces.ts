/**
 * surfaces.ts — the focus-scoped tool family for each chart.
 *
 * `registry.focus(id)` only registers a family for a surface that was
 * previously registered, so every chart id needs a `SurfaceDef` here. For 2.2
 * each family starts with ONE real tool — `<id>_describe_trend` — that speaks
 * the chart's headline computed from the JSON, and mirrors a `describe-trend`
 * event. Item 3.2 adds siblings (query_point, query_range, …) to these same
 * families; keep this file the home for per-chart tools.
 */

import type { SurfaceDef, ToolDef } from '../lib/agent-a11y'
import { CHARTS, getChart, type ChartMeta } from './charts.ts'

/** The starter tool name for a chart family, e.g. `maize-prices_describe_trend`. */
export function describeTrendToolName(chartId: string): string {
  return `${chartId}_describe_trend`
}

/** Build the single starter tool for a chart: speaks its real-data headline. */
function describeTrendTool(chart: ChartMeta): ToolDef {
  return {
    name: describeTrendToolName(chart.id),
    // Grammar: task-level + steering back to orientation.
    description:
      `Summarise the "${chart.title}" chart in one spoken line, with its real ` +
      `headline figures. Focus this chart first; call describe_screen for the ` +
      `whole dashboard.`,
    inputSchema: { type: 'object', properties: {} },
    execute: () => ({
      speech: `${chart.title}: ${chart.headline()}`,
      data: {
        id: chart.id,
        title: chart.title,
        unit: chart.unit,
        period: chart.period,
        headline: chart.headline(),
      },
      mirror: { kind: 'describe-trend', chartId: chart.id },
    }),
    argsSummary: () => `${describeTrendToolName(chart.id)}()`,
  }
}

/** The focus-scoped surface definition for one chart. */
export function surfaceFor(chart: ChartMeta): SurfaceDef {
  return {
    describe: `${chart.title} — ${chart.unit}, ${chart.period}.`,
    tools: [describeTrendTool(chart)],
  }
}

/** Every chart's surface def, keyed by chart id. */
export const CHART_SURFACES: Record<string, SurfaceDef> = Object.fromEntries(
  CHARTS.map((chart) => [chart.id, surfaceFor(chart)]),
)

/** Registered tool names a chart's family exposes while focused (order preserved). */
export function toolNamesFor(chartId: string): string[] {
  return CHART_SURFACES[chartId]?.tools.map((t) => t.name) ?? []
}

/** How many tools a chart's family exposes while focused. */
export function toolCountFor(chartId: string): number {
  return CHART_SURFACES[chartId]?.tools.length ?? 0
}

// Re-export for convenience so integration code has one import site.
export { getChart }
