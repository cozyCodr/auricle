/**
 * AreaChart — hand-rolled SVG DIVERGING area for a signed series around zero.
 *
 * The anomaly is filled warm red ABOVE the 0 baseline and cool blue BELOW it,
 * with a thin ink line on top. Implementation: ONE area polygon (the series
 * closed along the y(0) baseline) drawn twice, clipped against the zero line —
 * once with a rect covering the region above zero (red), once below (blue).
 *
 * COLOR NOTE: diverging polarity around zero is the one legitimate diverging
 * color use in this app (with the stripes ramp). The sign of the anomaly is a
 * true polarity — warmer/cooler than the 1951–1980 baseline — so red-above /
 * blue-below encodes meaning a single hue cannot. Everywhere else Auricle
 * keeps to its single data hue.
 *
 * Accepts the same `highlight` prop as LineChart (gold range band or point
 * glow + dark tooltip) so mirror events route to this view unchanged.
 */

import { useId } from 'react'
import type { LinePoint, LineHighlight, ChartVariant } from './types.ts'
import { linScale, yBounds, xBounds, buildPath, pickTicks } from './scale.ts'

export interface AreaChartProps {
  points: readonly LinePoint[]
  /** Accessible summary — include the chart title and its real headline figure. */
  ariaLabel: string
  variant?: ChartVariant
  highlight?: LineHighlight
  formatY?: (v: number) => string
  formatXTick?: (p: LinePoint) => string
}

const HERO = { w: 980, h: 250, top: 18, right: 18, bottom: 34, left: 52 }
const SMALL = { w: 280, h: 116, top: 8, right: 8, bottom: 14, left: 8 }

/** Warm red above zero; cool blue below (the diverging polarity fills). */
const WARM_FILL = 'rgba(178, 24, 43, 0.55)'
const COOL_FILL = 'rgba(33, 102, 172, 0.5)'

export function AreaChart({
  points,
  ariaLabel,
  variant = 'small',
  highlight,
  formatY = (v) => v.toFixed(1),
  formatXTick,
}: AreaChartProps) {
  const hero = variant === 'hero'
  const box = hero ? HERO : SMALL
  const idBase = useId()

  const plotL = box.left
  const plotR = box.w - box.right
  const plotT = box.top
  const plotB = box.h - box.bottom

  // y-domain must contain zero — the baseline the area diverges around.
  const raw = yBounds(points)
  const yMin = Math.min(raw.min, 0)
  const yMax = Math.max(raw.max, 0)
  const { min: xMin, max: xMax } = xBounds(points)
  const sx = linScale(xMin, xMax, plotL, plotR)
  const sy = linScale(yMin, yMax, plotB, plotT)
  const y0 = sy(0)

  // The series closed down to the zero baseline: one polygon, clipped twice.
  const areaPath =
    `M${sx(points[0].x).toFixed(1)},${y0.toFixed(1)} ` +
    points.map((p) => `L${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ') +
    ` L${sx(points[points.length - 1].x).toFixed(1)},${y0.toFixed(1)} Z`

  const yTicks = hero ? [yMin, yMin / 2, 0, yMax / 2, yMax] : []
  const xTicks = hero ? pickTicks(points, 4) : []

  return (
    <svg
      className={`areachart areachart--${variant}`}
      viewBox={`0 0 ${box.w} ${box.h}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={ariaLabel}
    >
      <defs>
        <clipPath id={`${idBase}-above`}>
          <rect x={plotL} y={plotT} width={plotR - plotL} height={Math.max(0, y0 - plotT)} />
        </clipPath>
        <clipPath id={`${idBase}-below`}>
          <rect x={plotL} y={y0} width={plotR - plotL} height={Math.max(0, plotB - y0)} />
        </clipPath>
        <clipPath id={`${idBase}-plot`}>
          <rect x={plotL} y={plotT} width={plotR - plotL} height={plotB - plotT} />
        </clipPath>
      </defs>

      {/* Highlight: gold range band (under the area so the fills read on top) */}
      {highlight?.kind === 'range' && (
        <g clipPath={`url(#${idBase}-plot)`}>
          <rect
            className="linechart__band"
            x={Math.min(sx(highlight.start), sx(highlight.end))}
            y={plotT}
            width={Math.abs(sx(highlight.end) - sx(highlight.start))}
            height={plotB - plotT}
          />
        </g>
      )}

      {/* The diverging fills: same polygon, clipped at the zero line */}
      <path d={areaPath} fill={WARM_FILL} clipPath={`url(#${idBase}-above)`} />
      <path d={areaPath} fill={COOL_FILL} clipPath={`url(#${idBase}-below)`} />

      {/* Zero baseline — the axis the polarity diverges around */}
      <line x1={plotL} y1={y0} x2={plotR} y2={y0} className="areachart__zero" />

      {/* Thin ink line on top */}
      <path
        d={buildPath(points, sx, sy)}
        className="areachart__line"
        fill="none"
        clipPath={`url(#${idBase}-plot)`}
      />

      {/* Axis labels (hero only) */}
      {hero &&
        yTicks.map((t, i) => (
          <text key={`yl${i}`} x={plotL - 8} y={sy(t) + 4} className="linechart__ylabel" textAnchor="end">
            {formatY(t)}
          </text>
        ))}
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

      {/* Highlight: point glow + dark tooltip */}
      {highlight?.kind === 'point' && (() => {
        const px = sx(highlight.x)
        const match = points.find((p) => p.x === highlight.x)
        const py = match ? sy(match.y) : plotT
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
