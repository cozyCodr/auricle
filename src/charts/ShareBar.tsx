/**
 * ShareBar — a single 100% proportion bar: each top emitter's share of the
 * REAL global total, remainder as "Rest of world". The craft-approved pie
 * alternative — NO pie charts in this app.
 *
 * Craft: segments in ONE hue at stepped lightnesses (biggest share darkest,
 * "Rest of world" lightest — not a rainbow), 2px gaps between segments, labels
 * with percentages in ink tokens under the bar. Mirror-driven `emphasisLabel`
 * rings the named segment and shows the shared dark tooltip.
 */

import type { ChartVariant } from './types.ts'
import type { ShareSegment } from './data.ts'
import { mixHex } from './scale.ts'

export interface ShareBarProps {
  segments: readonly ShareSegment[]
  ariaLabel: string
  variant?: ChartVariant
  /** Mirror-driven: ring + tooltip on the segment whose label matches. */
  emphasisLabel?: string
  emphasisDetail?: string
}

const HERO = { w: 980, h: 250, side: 14, barY: 34, barH: 58, legendY: 128, legendRowH: 22 }
const SMALL = { w: 280, h: 116, side: 8, barY: 18, barH: 40, legendY: 78, legendRowH: 14 }

/** The single data hue, stepped toward a pale tint by rank (never a rainbow). */
const BASE_HUE = '#2166ac'
const PALE_TINT = '#d1e5f0'

function segmentColor(i: number, count: number): string {
  const t = count > 1 ? i / (count - 1) : 0
  return mixHex(BASE_HUE, PALE_TINT, t * 0.85)
}

function pct(share: number): string {
  const v = share * 100
  return `${v >= 10 ? v.toFixed(1) : v.toFixed(1)}%`
}

export function ShareBar({
  segments,
  ariaLabel,
  variant = 'small',
  emphasisLabel,
  emphasisDetail,
}: ShareBarProps) {
  const hero = variant === 'hero'
  const box = hero ? HERO : SMALL
  const plotL = box.side
  const plotR = box.w - box.side
  const gap = 2 // craft: 2px gaps between segments
  const usable = plotR - plotL - gap * (segments.length - 1)

  // Segment x-extents from the real shares (accumulated left → right).
  const rects: { seg: ShareSegment; x: number; w: number; color: string }[] = []
  for (const [i, s] of segments.entries()) {
    const prev = rects[i - 1]
    const x = prev ? prev.x + prev.w + gap : plotL
    const w = Math.max(1, s.share * usable)
    rects.push({ seg: s, x, w, color: segmentColor(i, segments.length) })
  }

  // Legend rows under the bar (hero: two columns; small: top segment only).
  const perCol = Math.ceil(segments.length / 2)

  return (
    <svg
      className={`sharebar sharebar--${variant}`}
      viewBox={`0 0 ${box.w} ${box.h}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={ariaLabel}
    >
      {/* The 100% bar — segments grow left-to-right on mount (CSS sharebar__seg). */}
      {rects.map((r, i) => (
        <rect
          key={r.seg.label}
          className="sharebar__seg"
          style={{ animationDelay: `${(0.15 + i * 0.07).toFixed(2)}s` }}
          x={r.x}
          y={box.barY}
          width={r.w}
          height={box.barH}
          fill={r.color}
        >
          <title>{`${r.seg.label}: ${pct(r.seg.share)}`}</title>
        </rect>
      ))}

      {/* In-segment % for wide-enough segments (hero only, ink on light / bg on dark) */}
      {hero &&
        rects.map((r, i) =>
          r.w > 64 ? (
            <text
              key={`p${r.seg.label}`}
              x={r.x + r.w / 2}
              y={box.barY + box.barH / 2 + 4}
              className="sharebar__inpct"
              textAnchor="middle"
              fill={i < segments.length / 2 ? 'var(--bg)' : 'var(--ink)'}
            >
              {pct(r.seg.share)}
            </text>
          ) : null,
        )}

      {/* Labels under with percentages — swatch + name + % in ink tokens */}
      {hero
        ? rects.map((r, i) => {
            const col = Math.floor(i / perCol)
            const row = i % perCol
            const lx = plotL + col * ((plotR - plotL) / 2)
            const ly = box.legendY + row * box.legendRowH
            return (
              <g key={`l${r.seg.label}`}>
                <rect x={lx} y={ly - 9} width={11} height={11} fill={r.color} />
                <text x={lx + 18} y={ly} className="sharebar__label">
                  {r.seg.label}
                </text>
                <text x={lx + 18 + 150} y={ly} className="sharebar__pct">
                  {pct(r.seg.share)} · {Math.round(r.seg.value).toLocaleString('en-US')} Mt
                </text>
              </g>
            )
          })
        : (() => {
            const top = rects[0]
            return (
              <text x={plotL} y={box.legendY} className="sharebar__label">
                {top.seg.label} {pct(top.seg.share)} of the world total
              </text>
            )
          })()}

      {/* Mirror-driven emphasis: gold ring + dark tooltip on the named segment */}
      {emphasisLabel != null && (() => {
        const hit = rects.find((r) => r.seg.label === emphasisLabel)
        if (!hit) return null
        const tw = hero ? 190 : 130
        const th = emphasisDetail ? (hero ? 40 : 32) : hero ? 24 : 20
        const cx = hit.x + hit.w / 2
        const bx = Math.min(Math.max(plotL, cx - tw / 2), plotR - tw)
        const by = Math.max(2, box.barY - th - 8)
        return (
          <g className="chart-tip">
            <rect
              x={hit.x - 2}
              y={box.barY - 2}
              width={hit.w + 4}
              height={box.barH + 4}
              rx={3}
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
              {emphasisLabel} {pct(hit.seg.share)}
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
