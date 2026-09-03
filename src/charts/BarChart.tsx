/**
 * BarChart — hand-rolled SVG vertical bars, single data hue.
 *
 * Used for the latest-year top-emitter comparators. Craft: one hue for every bar, a 2px
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
  /** Mirror-driven: gold ring + dark tooltip on the bar whose label matches (3.2). */
  emphasisLabel?: string
  emphasisDetail?: string
}

const HERO = { w: 980, h: 250, top: 20, bottom: 44, side: 24 }
const SMALL = { w: 260, h: 110, top: 12, bottom: 22, side: 10 }

export function BarChart({
  data,
  ariaLabel,
  variant = 'small',
  formatValue = (v) => (Math.abs(v) >= 100 ? Math.round(v).toString() : v.toFixed(1)),
  emphasisLabel,
  emphasisDetail,
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
              rx={0}
              className={`barchart__bar${d.emphasis ? ' barchart__bar--emphasis' : ''}`}
              style={{ animationDelay: `${(0.15 + i * 0.06).toFixed(2)}s` }}
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

      {/* Mirror-driven emphasis: gold ring + dark tooltip on the named bar (3.2) */}
      {emphasisLabel != null && (() => {
        const idx = data.findIndex((d) => d.label === emphasisLabel)
        if (idx < 0) return null
        const d = data[idx]
        const x = box.side + idx * (bw + gap)
        const y = sy(d.value)
        const h = Math.max(0, plotB - y)
        const tw = hero ? 168 : 120
        const th = hero ? (emphasisDetail ? 40 : 24) : emphasisDetail ? 32 : 20
        const cx = x + bw / 2
        const flipR = cx + tw / 2 > box.w - box.side
        const flipL = cx - tw / 2 < box.side
        const bx = flipR ? box.w - box.side - tw : flipL ? box.side : cx - tw / 2
        const by = Math.max(2, y - th - 8)
        return (
          <g>
            <rect
              x={x - 3}
              y={y - 3}
              width={bw + 6}
              height={h + 3}
              rx={hero ? 6 : 5}
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
              {emphasisLabel}
              {' '}
              {formatValue(d.value)}
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
