/**
 * StripesChart — the warming stripes as a REAL, QUERYABLE chart.
 *
 * One vertical SVG rect per year, colored by the year's actual anomaly on the
 * Hawkins-style diverging blue→white→red ramp. The ramp maps the REAL values:
 * the data minimum lands on the deep-blue end (#2166ac), zero on near-white,
 * and the data maximum (+1.28 °C in 2024) on the deep-red end (#67000d).
 *
 * COLOR NOTE: this ramp is the second of the app's two legitimate diverging
 * color uses (with the diverging area) — anomaly sign around the 1951–1980
 * zero is a true polarity, so a diverging colormap carries real meaning here.
 *
 * Queryable: when a `query_point` / `find_extremes` highlight targets a year,
 * THAT stripe column gets an ink ring and the shared dark tooltip with the
 * real value; a range highlight outlines the span of years.
 */

import type { LinePoint, LineHighlight, ChartVariant } from './types.ts'
import { mixHex, pickTicks } from './scale.ts'

export interface StripesChartProps {
  points: readonly LinePoint[]
  /** Accessible summary — carries the real headline figures. */
  ariaLabel: string
  variant?: ChartVariant
  /** The mirror-driven highlight: point → ring that year's stripe; range → outline the span. */
  highlight?: LineHighlight
  /** Format a value for the tooltip, e.g. +1.28 °C. */
  formatValue?: (v: number) => string
}

const HERO = { w: 980, h: 250, top: 10, right: 10, bottom: 28, left: 10 }
const SMALL = { w: 280, h: 116, top: 6, right: 6, bottom: 6, left: 6 }

/** Hawkins-style endpoints: deep blue ← near-white → deep red. */
const DEEP_BLUE = '#2166ac'
const NEAR_WHITE = '#f6f4ee'
const DEEP_RED = '#67000d'

/** Map a real anomaly onto the diverging ramp given the data's min/max. */
function stripeColor(v: number, min: number, max: number): string {
  if (v >= 0) return mixHex(NEAR_WHITE, DEEP_RED, max > 0 ? v / max : 0)
  return mixHex(NEAR_WHITE, DEEP_BLUE, min < 0 ? v / min : 0)
}

export function StripesChart({
  points,
  ariaLabel,
  variant = 'small',
  highlight,
  formatValue = (v) => v.toFixed(2),
}: StripesChartProps) {
  const hero = variant === 'hero'
  const box = hero ? HERO : SMALL

  const plotL = box.left
  const plotR = box.w - box.right
  const plotT = box.top
  const plotB = box.h - box.bottom

  const n = points.length
  const cw = (plotR - plotL) / n
  const min = Math.min(...points.map((p) => p.y))
  const max = Math.max(...points.map((p) => p.y))
  const xFor = (i: number) => plotL + i * cw

  const xTicks = hero ? pickTicks(points.map((p, i) => ({ p, i })), 5) : []

  const ringIndex =
    highlight?.kind === 'point' ? points.findIndex((p) => p.x === highlight.x) : -1

  return (
    <svg
      className={`stripes stripes--${variant}`}
      viewBox={`0 0 ${box.w} ${box.h}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={ariaLabel}
    >
      {/* One column per year, colored by the real anomaly */}
      {points.map((p, i) => (
        <rect
          key={p.x}
          x={xFor(i)}
          y={plotT}
          width={cw + 0.5 /* overlap a hair so no seams appear between stripes */}
          height={plotB - plotT}
          fill={stripeColor(p.y, min, max)}
        >
          <title>{`${p.label}: ${formatValue(p.y)}`}</title>
        </rect>
      ))}

      {/* Year labels under the band (hero only) */}
      {hero &&
        xTicks.map(({ p, i }, k) => (
          <text
            key={`xl${p.x}`}
            x={xFor(i) + cw / 2}
            y={plotB + 18}
            className="linechart__xlabel"
            textAnchor={k === 0 ? 'start' : k === xTicks.length - 1 ? 'end' : 'middle'}
          >
            {p.label}
          </text>
        ))}

      {/* Range highlight: outline the span of years */}
      {highlight?.kind === 'range' && (() => {
        const i0 = points.findIndex((p) => p.x >= Math.min(highlight.start, highlight.end))
        const i1raw = points.findIndex((p) => p.x > Math.max(highlight.start, highlight.end))
        const i1 = i1raw < 0 ? n : i1raw
        if (i0 < 0) return null
        return (
          <rect
            className="stripes__ring"
            x={xFor(i0)}
            y={plotT + 1}
            width={Math.max(cw, (i1 - i0) * cw)}
            height={plotB - plotT - 2}
            rx={2}
          />
        )
      })()}

      {/* Point highlight: ring THAT year's stripe + the shared dark tooltip */}
      {ringIndex >= 0 && highlight?.kind === 'point' && (() => {
        const x = xFor(ringIndex)
        const cx = x + cw / 2
        const tw = hero ? 220 : 150
        const th = hero ? 44 : 34
        const flip = cx + 12 + tw > plotR
        const bx = flip ? cx - 12 - tw : cx + 12
        const by = plotT + (hero ? 14 : 8)
        const value = points[ringIndex]
        return (
          <g>
            <rect
              className="stripes__ring"
              x={x - 1}
              y={plotT + 1}
              width={cw + 2}
              height={plotB - plotT - 2}
              rx={2}
            />
            <g>
              <rect className="linechart__tip" x={bx} y={by} width={tw} height={th} rx={8} />
              <text className="linechart__tip-label" x={bx + 14} y={by + (hero ? 20 : 16)}>
                {highlight.label ?? `${value.label}: ${formatValue(value.y)}`}
              </text>
              {highlight.detail && (
                <text className="linechart__tip-detail" x={bx + 14} y={by + (hero ? 36 : 28)}>
                  {highlight.detail}
                </text>
              )}
            </g>
          </g>
        )
      })()}
    </svg>
  )
}
