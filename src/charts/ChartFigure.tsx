/**
 * ChartFigure — per-chart dispatch to the right SVG component.
 *
 * One place that knows which of the four hand-rolled components draws each chart
 * id, and its per-chart specifics (axis labels, formatters, the maize highlight).
 * under-5 mortality shows its Zambia trend LINE in the hero slot and the
 * comparator BARS in the small slot.
 */

import { getChart } from '../dashboard/charts.ts'
import type { ChartVariant, LineHighlight } from './types.ts'
import { LineChart } from './LineChart.tsx'
import { BarChart } from './BarChart.tsx'
import { ScatterChart } from './ScatterChart.tsx'
import { LiveFeed } from './LiveFeed.tsx'
import {
  maizeLine,
  mortalityLine,
  mortalityBars,
  yieldScatter,
  fxLine,
  fxCurrent,
} from './data.ts'
import { yieldFert } from '../dashboard/charts.ts'

/** aria-label combining the chart title with its real headline figure. */
function ariaFor(chartId: string): string {
  const c = getChart(chartId)
  return c ? `${c.title}. ${c.headline()}` : chartId
}

export function ChartFigure({
  chartId,
  variant,
  highlight,
}: {
  chartId: string
  variant: ChartVariant
  highlight?: LineHighlight
}) {
  const aria = ariaFor(chartId)

  switch (chartId) {
    case 'maize-prices':
      return (
        <LineChart
          points={maizeLine}
          variant={variant}
          ariaLabel={aria}
          highlight={highlight}
          formatY={(v) => `K${v.toFixed(1)}`}
          formatXTick={(p) => p.label.split(' ')[1] ?? p.label}
        />
      )

    case 'under5-mortality':
      // Hero → Zambia trend line; small card → latest comparator bars.
      return variant === 'hero' ? (
        <LineChart
          points={mortalityLine}
          variant="hero"
          ariaLabel={aria}
          highlight={highlight}
          formatY={(v) => v.toFixed(0)}
        />
      ) : (
        <BarChart data={mortalityBars} variant="small" ariaLabel={aria} />
      )

    case 'yield-fertilizer':
      return (
        <ScatterChart
          points={yieldScatter}
          variant={variant}
          ariaLabel={aria}
          xAxisLabel={yieldFert.x_label}
          yAxisLabel={yieldFert.y_label}
        />
      )

    case 'exchange-rate':
      return (
        <LiveFeed
          current={fxCurrent}
          series={fxLine}
          variant={variant}
          ariaLabel={aria}
          unit="ZMW/USD"
          caption={variant === 'hero' ? 'tools re-register on every tick' : undefined}
          simulated
        />
      )

    default:
      return null
  }
}
