/**
 * ChartFigure — per-chart dispatch to the right SVG component.
 *
 * One place that knows which of the four hand-rolled components draws each chart
 * id, and its per-chart specifics (axis labels, formatters, the visual mirror).
 * co2-emitters shows the global emissions LINE plus the top-emitter BAR strip in
 * the hero (so `compare_emitters` has bars to emphasise); the small card shows
 * the bars alone.
 *
 * `highlight` is a `MirrorHighlightEvent` from the mirror bus (via
 * `useChartHighlight`). Each chart maps the event to its own overlay — a line
 * band/point, a bar ring, a scatter ring, or the live answer pill.
 */

import { getChart, wealthCarbon, fmtAnomaly } from '../dashboard/charts.ts'
import type { ChartVariant } from './types.ts'
import { LineChart } from './LineChart.tsx'
import { BarChart } from './BarChart.tsx'
import { ScatterChart } from './ScatterChart.tsx'
import { Co2LiveFeed } from './LiveFeed.tsx'
import {
  tempLine,
  emittersGlobalLine,
  emitterBars,
  wealthScatter,
} from './data.ts'
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
    case 'temp-anomaly':
      return (
        <LineChart
          points={tempLine}
          variant={variant}
          ariaLabel={aria}
          highlight={lineHl}
          formatY={(v) => `${fmtAnomaly(v)}°`}
          formatXTick={(p) => p.label}
        />
      )

    case 'co2-emitters': {
      const barEmph = ev && ev.kind === 'bar-emphasis' ? ev : undefined
      // Hero → global emissions line ABOVE the top-emitter strip; small card → bars only.
      if (variant === 'hero') {
        return (
          <div>
            <LineChart
              points={emittersGlobalLine}
              variant="hero"
              ariaLabel={aria}
              highlight={lineHl}
              formatY={(v) => `${Math.round(v / 1000)} Gt`}
            />
            <div style={{ marginTop: 6 }}>
              <BarChart
                data={emitterBars}
                variant="small"
                ariaLabel={`CO₂ emissions, latest year by economy. ${emitterBars[0].label} highest.`}
                emphasisLabel={barEmph?.country}
                emphasisDetail={barEmph?.detail}
                formatValue={(v) => `${Math.round(v).toLocaleString('en-US')}`}
              />
            </div>
          </div>
        )
      }
      return <BarChart data={emitterBars} variant="small" ariaLabel={aria} />
    }

    case 'wealth-carbon': {
      const ring = ev && ev.kind === 'scatter-ring' ? ev : undefined
      return (
        <ScatterChart
          points={wealthScatter}
          variant={variant}
          ariaLabel={aria}
          xAxisLabel={wealthCarbon.x_label}
          yAxisLabel={wealthCarbon.y_label}
          ringLabelMatch={ring?.match}
          ringLabel={ring?.label}
          ringDetail={ring?.detail}
        />
      )
    }

    case 'co2-live': {
      const answer = ev && ev.kind === 'highlight-point' ? ev : undefined
      return (
        <Co2LiveFeed
          variant={variant}
          ariaLabel={aria}
          answerLabel={answer?.label}
          answerDetail={answer?.detail}
        />
      )
    }

    default:
      return null
  }
}
