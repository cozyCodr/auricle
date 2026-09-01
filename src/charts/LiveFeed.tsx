/**
 * LiveFeed — the "live" chart family: a big mono figure + a sparkline + a LIVE badge.
 *
 * Renders a static last value now; it accepts `current` separately from `series`
 * so 4.3 can drive the ticking value without touching the sparkline history.
 * Craft: single data hue for the sparkline, mono figures in ink, muted caption.
 */

import { useMemo } from 'react'
import type { LinePoint, ChartVariant } from './types.ts'
import { linScale, yBounds, xBounds, buildPath } from './scale.ts'
import { useLiveFeed } from '../dashboard/liveFeed.ts'
import { fxLine } from './data.ts'

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
  /** Mirror-driven: a dark "answer" pill (label + detail) shown when a tool replies (3.2). */
  answerLabel?: string
  answerDetail?: string
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
  answerLabel,
  answerDetail,
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

      {/* Mirror-driven answer pill: dark box with the tool's spoken figure (3.2) */}
      {answerLabel != null && (
        <div
          role="status"
          style={{
            display: 'inline-flex',
            flexDirection: 'column',
            alignSelf: 'flex-start',
            gap: 1,
            marginTop: hero ? 8 : 4,
            padding: hero ? '6px 12px' : '3px 8px',
            borderRadius: 8,
            background: 'var(--ink)',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-body)',
              fontWeight: 700,
              fontSize: hero ? 14 : 11,
              color: 'var(--bg)',
            }}
          >
            {answerLabel}
          </span>
          {answerDetail && (
            <span style={{ fontFamily: 'var(--font-body)', fontSize: hero ? 12 : 10, color: '#e8c778' }}>
              {answerDetail}
            </span>
          )}
        </div>
      )}

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

/**
 * ExchangeLiveFeed — the exchange-rate card, driven by the ticking session store
 * (4.3). The big figure and the sparkline update every ~5s: the sparkline is the
 * real baseline closes followed by this session's simulated ticks. This is where
 * the "live" of the live feed actually lives; the pure {@link LiveFeed} stays
 * presentational so it's reusable and testable.
 */
export function ExchangeLiveFeed({
  variant,
  ariaLabel,
  answerLabel,
  answerDetail,
}: {
  variant: ChartVariant
  ariaLabel: string
  answerLabel?: string
  answerDetail?: string
}) {
  const live = useLiveFeed()
  const series = useMemo<LinePoint[]>(() => {
    const baseLastX = fxLine.length ? fxLine[fxLine.length - 1].x : 0
    // buffer[0] is the seed (== baseline's last close), so skip it to avoid a dup.
    const ticks = live.buffer.slice(1).map<LinePoint>((y, i) => ({
      x: baseLastX + i + 1,
      y,
      label: `tick ${i + 1}`,
    }))
    return [...fxLine, ...ticks]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live.tickCount])

  return (
    <LiveFeed
      current={live.current}
      series={series}
      variant={variant}
      ariaLabel={ariaLabel}
      unit="ZMW/USD"
      caption={variant === 'hero' ? 'tools re-register on every tick' : undefined}
      simulated
      answerLabel={answerLabel}
      answerDetail={answerDetail}
    />
  )
}
