/**
 * ScatterChart — hand-rolled SVG scatter, single data hue.
 *
 * Used for cereal yield vs fertilizer. Craft: dots ≥8px diameter in one hue, a
 * recessive grid + two axis lines (x baseline, y left), axis titles in muted ink.
 * No trend line is drawn (the relationship is deliberately noisy/rain-dependent).
 */

import type { ScatterPoint, ChartVariant } from './types.ts'
import { linScale, yBounds, xBounds } from './scale.ts'

export interface ScatterChartProps {
  points: readonly ScatterPoint[]
  ariaLabel: string
  variant?: ChartVariant
  xAxisLabel?: string
  yAxisLabel?: string
}

const HERO = { w: 980, h: 250, top: 18, right: 24, bottom: 44, left: 58 }
const SMALL = { w: 260, h: 110, top: 8, right: 8, bottom: 16, left: 12 }

export function ScatterChart({
  points,
  ariaLabel,
  variant = 'small',
  xAxisLabel,
  yAxisLabel,
}: ScatterChartProps) {
  const hero = variant === 'hero'
  const box = hero ? HERO : SMALL
  const plotL = box.left
  const plotR = box.w - box.right
  const plotT = box.top
  const plotB = box.h - box.bottom

  const { min: xMin, max: xMax } = xBounds(points)
  const yb = yBounds(points, 0.1)
  const xb = { min: Math.min(0, xMin), max: xMax }
  const sx = linScale(xb.min, xMax, plotL, plotR)
  const sy = linScale(yb.min, yb.max, plotB, plotT)

  const gridCount = 3
  const yGrid: number[] = []
  for (let i = 1; i <= gridCount; i++) yGrid.push(yb.min + (i / (gridCount + 1)) * (yb.max - yb.min))

  return (
    <svg
      className={`scatter scatter--${variant}`}
      viewBox={`0 0 ${box.w} ${box.h}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={ariaLabel}
    >
      {hero &&
        yGrid.map((t, i) => (
          <line key={`g${i}`} x1={plotL} y1={sy(t)} x2={plotR} y2={sy(t)} className="scatter__grid" />
        ))}

      {/* Axes */}
      <line x1={plotL} y1={plotB} x2={plotR} y2={plotB} className="scatter__axis" />
      <line x1={plotL} y1={plotT} x2={plotL} y2={plotB} className="scatter__axis-soft" />

      {points.map((p, i) => (
        <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={hero ? 5.5 : 4.5} className="scatter__dot">
          <title>{`${p.label}: ${p.x} → ${p.y}`}</title>
        </circle>
      ))}

      {hero && xAxisLabel && (
        <text x={(plotL + plotR) / 2} y={box.h - 8} className="scatter__axis-title" textAnchor="middle">
          {xAxisLabel}
        </text>
      )}
      {hero && yAxisLabel && (
        <text
          x={16}
          y={(plotT + plotB) / 2}
          className="scatter__axis-title"
          textAnchor="middle"
          transform={`rotate(-90 16 ${(plotT + plotB) / 2})`}
        >
          {yAxisLabel}
        </text>
      )}
    </svg>
  )
}
