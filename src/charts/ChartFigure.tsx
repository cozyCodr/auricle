/**
 * ChartFigure — per-view dispatch to the right SVG component.
 *
 * One place that knows how each (chartId, kind) pair is drawn. Since P0-01b a
 * dataset can be commissioned as MULTIPLE kinds at once (temp-anomaly as line
 * AND stripes, co2-emitters as bars, ranked hbars, or a share-of-total bar,
 * any dataset as a big-number stat tile), so dispatch is on `kind` with the
 * dataset picking the series. `kind` defaults to the dataset's canonical kind.
 *
 * `highlight` is a `MirrorHighlightEvent` from the mirror bus (via
 * `useChartHighlight`). Every rendered view of a chartId receives the same
 * event and maps it to its own overlay — line/area band or point, the ringed
 * stripe column, the ringed hbar/share segment, or the stat tile's flash.
 */

import { getChart, wealthCarbon, fmtAnomaly, type ChartKind } from '../dashboard/charts.ts'
import type { ChartVariant } from './types.ts'
import { LineChart } from './LineChart.tsx'
import { BarChart } from './BarChart.tsx'
import { ScatterChart } from './ScatterChart.tsx'
import { Co2LiveFeed } from './LiveFeed.tsx'
import { AreaChart } from './AreaChart.tsx'
import { StripesChart } from './StripesChart.tsx'
import { HBarChart } from './HBarChart.tsx'
import { ShareBar } from './ShareBar.tsx'
import { StatTile } from './StatTile.tsx'
import {
  tempLine,
  emittersGlobalLine,
  emitterBars,
  emitterRanked,
  emitterShares,
  shareYear,
  shareGlobalTotal,
  wealthScatter,
  statFor,
} from './data.ts'
import { lineHighlightFromMirror, type MirrorHighlightEvent } from './highlight.ts'

/** aria-label combining the chart title with its real headline figure. */
function ariaFor(chartId: string): string {
  const c = getChart(chartId)
  return c ? `${c.title}. ${c.headline()}` : chartId
}

export function ChartFigure({
  chartId,
  kind,
  variant,
  highlight,
}: {
  chartId: string
  /** The view's kind; defaults to the dataset's canonical kind. */
  kind?: ChartKind
  variant: ChartVariant
  /** The current mirror highlight event for this chart, or undefined. */
  highlight?: MirrorHighlightEvent
}) {
  const chart = getChart(chartId)
  const resolvedKind: ChartKind = kind ?? chart?.kind ?? 'line'
  const aria = ariaFor(chartId)
  // Only apply an event that actually targets this chart.
  const ev = highlight && highlight.chartId === chartId ? highlight : undefined
  const lineHl = ev ? lineHighlightFromMirror(ev) ?? undefined : undefined
  const barEmph = ev && ev.kind === 'bar-emphasis' ? ev : undefined

  switch (resolvedKind) {
    case 'line':
      // temp-anomaly's canonical line (the only whitelisted 'line' pairing).
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

    case 'area':
      // Diverging area: red above the 0 baseline, blue below (see AreaChart's
      // color note — the one legitimate diverging fill).
      return (
        <AreaChart
          points={tempLine}
          variant={variant}
          ariaLabel={`${aria} Shown as a diverging area: red above the 1951–1980 baseline, blue below.`}
          highlight={lineHl}
          formatY={(v) => `${fmtAnomaly(v)}°`}
          formatXTick={(p) => p.label}
        />
      )

    case 'stripes':
      return (
        <StripesChart
          points={tempLine}
          variant={variant}
          ariaLabel={`${aria} Shown as warming stripes: one column per year, blue for cooler than the 1951–1980 baseline, red for warmer.`}
          highlight={lineHl}
          formatValue={(v) => `${fmtAnomaly(v)} °C`}
        />
      )

    case 'bar': {
      // co2-emitters' canonical view: hero → global emissions line ABOVE the
      // top-emitter strip; small card → bars only.
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
      return (
        <BarChart
          data={emitterBars}
          variant="small"
          ariaLabel={aria}
          emphasisLabel={barEmph?.country}
          emphasisDetail={barEmph?.detail}
        />
      )
    }

    case 'hbar':
      return (
        <HBarChart
          data={emitterRanked}
          variant={variant}
          ariaLabel={`${aria} Shown as ranked horizontal bars, largest emitter first.`}
          emphasisLabel={barEmph?.country}
          emphasisDetail={barEmph?.detail}
        />
      )

    case 'share':
      return (
        <ShareBar
          segments={emitterShares}
          variant={variant}
          ariaLabel={
            `CO₂ emissions as shares of the world total, ${shareYear} ` +
            `(${Math.round(shareGlobalTotal).toLocaleString('en-US')} Mt): ` +
            emitterShares
              .map((s) => `${s.label} ${(s.share * 100).toFixed(1)}%`)
              .join(', ') +
            '.'
          }
          emphasisLabel={barEmph?.country}
          emphasisDetail={barEmph?.detail}
        />
      )

    case 'scatter': {
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

    case 'live': {
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

    case 'stat': {
      const stat = statFor(chartId)
      return (
        <StatTile
          chartId={chartId}
          variant={variant}
          ariaLabel={stat ? `${chart?.title ?? chartId}. ${stat.figure} — ${stat.context}.` : aria}
          flash={Boolean(ev)}
        />
      )
    }

    default:
      return null
  }
}
