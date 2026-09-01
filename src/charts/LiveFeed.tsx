/**
 * LiveFeed — the "live" chart family: a big mono figure + a sparkline + a LIVE badge.
 *
 * Renders a static last value now; it accepts `current` separately from `series`
 * so 4.3 can drive the ticking value without touching the sparkline history.
 * Craft: single data hue for the sparkline, mono figures in ink, muted caption.
 */

import type { LinePoint, ChartVariant } from './types.ts'
import { linScale, yBounds, xBounds, buildPath } from './scale.ts'

export interface LiveFeedProps {
  /** The big headline number (latest close). Kept separate so 4.3 can tick it. */
  current: number
  series: readonly LinePoint[]
  ariaLabel: string
  unit?: string
  /** Caption under the sparkline, e.g. "tools re-register on every tick". */
  caption?: string
  simulated?: boolean
  variant?: ChartVariant
  formatValue?: (v: number) => string
}

const HERO = { w: 980, h: 130 }
const SMALL = { w: 260, h: 44 }

export function LiveFeed({
  current,
  series,
  ariaLabel,
  unit,
  caption,
  simulated = true,
  variant = 'small',
  formatValue = (v) => v.toFixed(2),
}: LiveFeedProps) {
  const hero = variant === 'hero'
  const box = hero ? HERO : SMALL
  const pad = 4
  const { min: xMin, max: xMax } = xBounds(series)
  const { min: yMin, max: yMax } = yBounds(series, 0.15)
  const sx = linScale(xMin, xMax, pad, box.w - pad)
  const sy = linScale(yMin, yMax, box.h - pad, pad)
  const path = buildPath(series, sx, sy)
  const last = series[series.length - 1]

  return (
    <div className={`livefeed livefeed--${variant}`}>
      <div className="livefeed__row">
        <div className="livefeed__value" aria-label={ariaLabel}>
          {formatValue(current)}
          {unit && <span className="livefeed__unit"> {unit}</span>}
        </div>
        <span className="livefeed__badge">
          <span className="livefeed__dot" aria-hidden="true" />
          LIVE
        </span>
      </div>

      <svg
        className="livefeed__spark"
        viewBox={`0 0 ${box.w} ${box.h}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Sparkline of ${series.length} recent closes`}
      >
        <path d={path} className="livefeed__line" fill="none" />
        {last && <circle cx={sx(last.x)} cy={sy(last.y)} r={hero ? 4 : 3} className="livefeed__end" />}
      </svg>

      {(caption || simulated) && (
        <div className="livefeed__caption">
          {simulated ? 'simulated feed' : ''}
          {simulated && caption ? ' · ' : ''}
          {caption}
        </div>
      )}
    </div>
  )
}
