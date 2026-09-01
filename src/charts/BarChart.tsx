/**
 * BarChart — hand-rolled SVG vertical bars, single data hue.
 *
 * Used for the under-5 mortality comparators. Craft: one hue for every bar, a 2px
 * gap between bars (rounded tops), a single baseline axis, category labels in
 * muted ink. The home country is marked with an ink outline + value label rather
 * than a second color, keeping the single-hue rule intact.
 */

import type { BarDatum, ChartVariant } from './types.ts'
import { linScale } from './scale.ts'

export interface BarChartProps {
  data: readonly BarDatum[]
  ariaLabel: string
  variant?: ChartVariant
  /** Format a value for the emphasized bar's inline label. Default: rounded to 1 dp. */
  formatValue?: (v: number) => string
}

const HERO = { w: 980, h: 250, top: 20, bottom: 44, side: 24 }
const SMALL = { w: 260, h: 110, top: 12, bottom: 22, side: 10 }

export function BarChart({
  data,
  ariaLabel,
  variant = 'small',
  formatValue = (v) => (Math.abs(v) >= 100 ? Math.round(v).toString() : v.toFixed(1)),
}: BarChartProps) {
  const hero = variant === 'hero'
  const box = hero ? HERO : SMALL
  const plotB = box.h - box.bottom
  const plotT = box.top
  const max = Math.max(...data.map((d) => d.value)) || 1
  const sy = linScale(0, max, plotB, plotT)

  const n = data.length
  const gap = hero ? 14 : 6
  const usable = box.w - box.side * 2 - gap * (n - 1)
  const bw = usable / n

  return (
    <svg
      className={`barchart barchart--${variant}`}
      viewBox={`0 0 ${box.w} ${box.h}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={ariaLabel}
    >
      {/* Baseline */}
      <line x1={box.side} y1={plotB} x2={box.w - box.side} y2={plotB} className="barchart__axis" />

      {data.map((d, i) => {
        const x = box.side + i * (bw + gap)
        const y = sy(d.value)
        const h = plotB - y
        return (
          <g key={d.label}>
            <rect
              x={x}
              y={y}
              width={bw}
              height={Math.max(0, h)}
              rx={hero ? 4 : 3}
              className={`barchart__bar${d.emphasis ? ' barchart__bar--emphasis' : ''}`}
            />
            {hero && (
              <text x={x + bw / 2} y={plotB + 20} className="barchart__cat" textAnchor="middle">
                {d.label}
              </text>
            )}
            {hero && (
              <text x={x + bw / 2} y={y - 8} className="barchart__value" textAnchor="middle">
                {formatValue(d.value)}
              </text>
            )}
            {/* On small cards, inline-label only the emphasized bar to avoid clutter */}
            {!hero && d.emphasis && (
              <text x={x + bw / 2} y={y - 4} className="barchart__value" textAnchor="middle">
                {formatValue(d.value)}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}
