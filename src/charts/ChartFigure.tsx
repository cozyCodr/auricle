/**
 * ChartFigure — per-chart dispatch to the right SVG component.
 *
 * One place that knows which of the four hand-rolled components draws each chart
 * id, and its per-chart specifics (axis labels, formatters, the visual mirror).
 * under-5 mortality shows its Zambia trend LINE plus a comparator BAR strip in
 * the hero (so `compare_countries` has bars to emphasise); the small card shows
 * the comparator bars alone.
 *
 * 3.2: `highlight` is a `MirrorHighlightEvent` from the mirror bus (via
 * `useChartHighlight`). Each chart maps the event to its own overlay — a line
 * band/point, a bar ring, a scatter ring, or the live answer pill.
 */

import { getChart } from '../dashboard/charts.ts'
import type { ChartVariant } from './types.ts'
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
import { lineHighlightFromMirror, type MirrorHighlightEvent } from './highlight.ts'

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
  /** The current mirror highlight event for this chart (hero only), or undefined. */
  highlight?: MirrorHighlightEvent
}) {
  const aria = ariaFor(chartId)
  // Only apply an event that actually targets this chart.
  const ev = highlight && highlight.chartId === chartId ? highlight : undefined
  const lineHl = ev ? lineHighlightFromMirror(ev) ?? undefined : undefined

  switch (chartId) {
    case 'maize-prices':
      return (
        <LineChart
          points={maizeLine}
          variant={variant}
          ariaLabel={aria}
          highlight={lineHl}
          formatY={(v) => `K${v.toFixed(1)}`}
          formatXTick={(p) => p.label.split(' ')[1] ?? p.label}
        />
      )

    case 'under5-mortality': {
      const barEmph = ev && ev.kind === 'bar-emphasis' ? ev : undefined
      // Hero → Zambia trend line ABOVE the comparator strip; small card → bars only.
      if (variant === 'hero') {
        return (
          <div>
            <LineChart
              points={mortalityLine}
              variant="hero"
              ariaLabel={aria}
              highlight={lineHl}
              formatY={(v) => v.toFixed(0)}
            />
            <div style={{ marginTop: 6 }}>
              <BarChart
                data={mortalityBars}
                variant="small"
                ariaLabel={`Under-5 mortality, latest year by country. ${mortalityBars[0].label} highest.`}
                emphasisLabel={barEmph?.country}
                emphasisDetail={barEmph?.detail}
                formatValue={(v) => v.toFixed(1)}
              />
            </div>
          </div>
        )
      }
      return <BarChart data={mortalityBars} variant="small" ariaLabel={aria} />
    }

    case 'yield-fertilizer': {
      const ring = ev && ev.kind === 'scatter-ring' ? ev : undefined
      return (
        <ScatterChart
          points={yieldScatter}
          variant={variant}
          ariaLabel={aria}
          xAxisLabel={yieldFert.x_label}
          yAxisLabel={yieldFert.y_label}
          ringLabelMatch={ring ? String(ring.year) : undefined}
          ringLabel={ring?.label}
          ringDetail={ring?.detail}
        />
      )
    }

    case 'exchange-rate': {
      const answer = ev && ev.kind === 'highlight-point' ? ev : undefined
      return (
        <LiveFeed
          current={fxCurrent}
          series={fxLine}
          variant={variant}
          ariaLabel={aria}
          unit="ZMW/USD"
          caption={variant === 'hero' ? 'tools re-register on every tick' : undefined}
          simulated
          answerLabel={answer?.label}
          answerDetail={answer?.detail}
        />
      )
    }

    default:
      return null
  }
}
