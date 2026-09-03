/**
 * HBarChart — hand-rolled SVG horizontal RANKED bars, single data hue.
 *
 * Rows sorted descending, country names as left labels (ink, never series
 * color), mono figures at each bar's end, 2px gaps between bars. Mirror-driven
 * `emphasisLabel` rings the named bar and shows the shared dark tooltip.
 */

import type { BarDatum, ChartVariant } from './types.ts'
import { linScale } from './scale.ts'

export interface HBarChartProps {
  /** Rows, expected pre-sorted descending (pass `emitterRanked`). */
  data: readonly BarDatum[]
  ariaLabel: string
  variant?: ChartVariant
  formatValue?: (v: number) => string
  /** Mirror-driven: gold ring + dark tooltip on the bar whose label matches. */
  emphasisLabel?: string
  emphasisDetail?: string
}

const HERO = { w: 980, h: 250, top: 12, bottom: 12, left: 128, right: 96 }
const SMALL = { w: 280, h: 116, top: 6, bottom: 6, left: 78, right: 44 }

export function HBarChart({
  data,
  ariaLabel,
  variant = 'small',
  formatValue = (v) => Math.round(v).toLocaleString('en-US'),
  emphasisLabel,
  emphasisDetail,
}: HBarChartProps) {
  const hero = variant === 'hero'
  const box = hero ? HERO : SMALL
  const plotL = box.left
  const plotR = box.w - box.right
  const plotT = box.top
  const plotB = box.h - box.bottom

  const n = data.length
  const gap = 2 // craft: 2px gaps between bars
  const rowH = (plotB - plotT - gap * (n - 1)) / n
  const max = Math.max(...data.map((d) => d.value)) || 1
  const sx = linScale(0, max, plotL, plotR)

  return (
    <svg
      className={`hbar hbar--${variant}`}
      viewBox={`0 0 ${box.w} ${box.h}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={ariaLabel}
    >
      {/* Baseline at zero */}
      <line x1={plotL} y1={plotT} x2={plotL} y2={plotB} className="barchart__axis" />

      {data.map((d, i) => {
        const y = plotT + i * (rowH + gap)
        const w = Math.max(0, sx(d.value) - plotL)
        const midY = y + rowH / 2
        return (
          <g key={d.label}>
            <text x={plotL - 8} y={midY + (hero ? 5 : 3.5)} className="hbar__cat" textAnchor="end">
              {d.label}
            </text>
            <rect
              x={plotL}
              y={y}
              width={w}
              height={rowH}
              rx={0}
              className="hbar__bar"
              style={{ animationDelay: `${(0.15 + i * 0.07).toFixed(2)}s` }}
            />
            <text x={plotL + w + 8} y={midY + (hero ? 5 : 3.5)} className="hbar__value">
              {formatValue(d.value)}
            </text>
          </g>
        )
      })}

      {/* Mirror-driven emphasis: gold ring + dark tooltip on the named bar */}
      {emphasisLabel != null && (() => {
        const idx = data.findIndex((d) => d.label === emphasisLabel)
        if (idx < 0) return null
        const d = data[idx]
        const y = plotT + idx * (rowH + gap)
        const w = Math.max(0, sx(d.value) - plotL)
        const tw = hero ? 190 : 130
        const th = emphasisDetail ? (hero ? 40 : 32) : hero ? 24 : 20
        const bx = Math.min(plotL + w + 14, box.w - tw - 4)
        const by = Math.min(Math.max(2, y - 4), box.h - th - 2)
        return (
          <g className="chart-tip">
            <rect
              x={plotL - 2}
              y={y - 2}
              width={w + 4}
              height={rowH + 4}
              rx={hero ? 5 : 4}
              fill="none"
              stroke="var(--gold-ink)"
              strokeWidth={hero ? 3 : 2}
            />
            <rect x={bx} y={by} width={tw} height={th} rx={7} fill="var(--ink)" />
            <text
              x={bx + 11}
              y={by + (hero ? 17 : 14)}
              fontFamily="var(--font-body)"
              fontSize={hero ? 13 : 11}
              fontWeight={700}
              fill="var(--bg)"
            >
              {emphasisLabel} {formatValue(d.value)}
            </text>
            {emphasisDetail && (
              <text
                x={bx + 11}
                y={by + (hero ? 33 : 27)}
                fontFamily="var(--font-body)"
                fontSize={hero ? 12 : 10}
                fill="#f4a582"
              >
                {emphasisDetail}
              </text>
            )}
          </g>
        )
      })()}
    </svg>
  )
}
