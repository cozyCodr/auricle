/**
 * LineChart — hand-rolled SVG line chart, hero-capable.
 *
 * Craft: single data hue (`--data-blue`), a 2.5px polyline, a recessive grid,
 * axis text in ink/muted tokens (never the data color), no dual axes. The line
 * BREAKS across real data gaps (see `computeSegments`) rather than interpolating.
 *
 * Accepts an optional `highlight` (gold range band or point glow + dark tooltip);
 * 3.2 drives this from mirror events, so the prop shape is stable here.
 */

import { useId } from 'react'
import type { LinePoint, LineHighlight, ChartVariant } from './types.ts'
import { linScale, yBounds, xBounds, buildPath, computeSegments, pickTicks } from './scale.ts'

export interface LineChartProps {
  points: readonly LinePoint[]
  /** Accessible summary — include the chart title and its real headline figure. */
  ariaLabel: string
  variant?: ChartVariant
  highlight?: LineHighlight
  /** Format a y-axis tick value (hero only). Default: rounded to 1 dp. */
  formatY?: (v: number) => string
  /** Format an x-axis tick from its point (hero only). Default: `point.label`. */
  formatXTick?: (p: LinePoint) => string
}

const HERO = { w: 980, h: 250, top: 18, right: 18, bottom: 34, left: 52 }
const SMALL = { w: 280, h: 116, top: 8, right: 8, bottom: 14, left: 8 }

export function LineChart({
  points,
  ariaLabel,
  variant = 'small',
  highlight,
  formatY = (v) => (Math.abs(v) >= 100 ? Math.round(v).toString() : v.toFixed(1)),
  formatXTick,
}: LineChartProps) {
  const hero = variant === 'hero'
  const box = hero ? HERO : SMALL
  const clipId = useId()

  const plotL = box.left
  const plotR = box.w - box.right
  const plotT = box.top
  const plotB = box.h - box.bottom

  const { min: yMin, max: yMax } = yBounds(points)
  const { min: xMin, max: xMax } = xBounds(points)
  const sx = linScale(xMin, xMax, plotL, plotR)
  const sy = linScale(yMin, yMax, plotB, plotT) // inverted: yMin at bottom

  const segments = computeSegments(points)

  // Grid + axis ticks (hero only — small cards stay minimal).
  const yTickCount = 4
  const yTicks: number[] = []
  for (let i = 0; i < yTickCount; i++) yTicks.push(yMin + (i / (yTickCount - 1)) * (yMax - yMin))
  const xTicks = pickTicks(points, 4)

  return (
    <svg
      className={`linechart linechart--${variant}`}
      viewBox={`0 0 ${box.w} ${box.h}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={ariaLabel}
    >
      <defs>
        <clipPath id={clipId}>
          <rect x={plotL} y={plotT} width={plotR - plotL} height={plotB - plotT} />
        </clipPath>
      </defs>

      {/* Recessive gridlines (hero only) */}
      {hero &&
        yTicks.map((t, i) => (
          <line
            key={`g${i}`}
            x1={plotL}
            y1={sy(t)}
            x2={plotR}
            y2={sy(t)}
            className={i === 0 ? 'linechart__axis' : 'linechart__grid'}
          />
        ))}

      {/* Baseline for small cards */}
      {!hero && (
        <line x1={plotL} y1={plotB} x2={plotR} y2={plotB} className="linechart__axis" />
      )}

      {/* Highlight: gold range band */}
      {highlight?.kind === 'range' && (
        <g clipPath={`url(#${clipId})`}>
          <rect
            className="linechart__band"
            x={Math.min(sx(highlight.start), sx(highlight.end))}
            y={plotT}
            width={Math.abs(sx(highlight.end) - sx(highlight.start))}
            height={plotB - plotT}
          />
          <line
            className="linechart__band-edge"
            x1={sx(highlight.end)}
            y1={plotT}
            x2={sx(highlight.end)}
            y2={plotB}
          />
        </g>
      )}

      {/* Y-axis tick labels (hero) */}
      {hero &&
        yTicks.map((t, i) => (
          <text key={`yl${i}`} x={plotL - 8} y={sy(t) + 4} className="linechart__ylabel" textAnchor="end">
            {formatY(t)}
          </text>
        ))}

      {/* X-axis tick labels (hero) */}
      {hero &&
        xTicks.map((p, i) => (
          <text
            key={`xl${i}`}
            x={sx(p.x)}
            y={plotB + 20}
            className="linechart__xlabel"
            textAnchor={i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'}
          >
            {(formatXTick ?? ((pt: LinePoint) => pt.label))(p)}
          </text>
        ))}

      {/* The data line — one polyline per contiguous segment (breaks across gaps) */}
      {segments.map((seg, i) => (
        <path
          key={`seg${i}`}
          d={buildPath(seg, sx, sy)}
          className="linechart__line"
          fill="none"
          clipPath={`url(#${clipId})`}
        />
      ))}

      {/* Highlight: point glow + dark tooltip box */}
      {highlight?.kind === 'point' && (() => {
        const px = sx(highlight.x)
        const match = points.find((p) => p.x === highlight.x)
        const py = match ? sy(match.y) : plotT
        // Keep the tooltip inside the plot: flip left when near the right edge.
        const tw = hero ? 220 : 150
        const th = hero ? 44 : 34
        const flip = px + 16 + tw > plotR
        const bx = flip ? px - 12 - tw : px + 12
        const by = Math.max(plotT + 2, py - th - 10)
        return (
          <g>
            <circle className="linechart__dot" cx={px} cy={py} r={hero ? 5 : 4} />
            {highlight.label && (
              <g>
                <rect className="linechart__tip" x={bx} y={by} width={tw} height={th} rx={8} />
                <text className="linechart__tip-label" x={bx + 14} y={by + (hero ? 20 : 16)}>
                  {highlight.label}
                </text>
                {highlight.detail && (
                  <text className="linechart__tip-detail" x={bx + 14} y={by + (hero ? 36 : 28)}>
                    {highlight.detail}
                  </text>
                )}
              </g>
            )}
          </g>
        )
      })()}
    </svg>
  )
}
