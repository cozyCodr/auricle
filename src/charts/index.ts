/**
 * charts — Auricle's hand-rolled SVG chart components + card shell.
 *
 * One import site for App (and 3.2, which drives `highlight`). The chart layer
 * reads only the baked datasets from `../dashboard/charts`; it never re-parses
 * JSON.
 */

export { LineChart } from './LineChart.tsx'
export type { LineChartProps } from './LineChart.tsx'
export { BarChart } from './BarChart.tsx'
export type { BarChartProps } from './BarChart.tsx'
export { ScatterChart } from './ScatterChart.tsx'
export type { ScatterChartProps } from './ScatterChart.tsx'
export { LiveFeed } from './LiveFeed.tsx'
export type { LiveFeedProps } from './LiveFeed.tsx'
export { DataTable } from './DataTable.tsx'
export { ChartFigure } from './ChartFigure.tsx'
export { ChartCard } from './ChartCard.tsx'

export type {
  LinePoint,
  ScatterPoint,
  BarDatum,
  LineHighlight,
  ChartVariant,
  TableColumn,
  TableModel,
} from './types.ts'

export { monthIndexOf, maizePeak, maizeDemoHighlight, tableFor } from './data.ts'
