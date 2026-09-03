/**
 * StatTile — the big-number view: one huge Spline Sans Mono figure plus one
 * context line, both computed from the real data (`statFor` in data.ts).
 *
 * Works for ANY dataset. Plain typographic hierarchy — no badges, no kickers.
 * When a mirror highlight targets this chart, the tile flashes (a brief gold
 * outline pulse, stilled under prefers-reduced-motion via CSS).
 */

import type { ChartVariant } from './types.ts'
import { statFor } from './data.ts'

export interface StatTileProps {
  chartId: string
  /** Accessible summary — the figure and its context, real numbers included. */
  ariaLabel: string
  variant?: ChartVariant
  /** True while a mirror highlight targets this chart — the tile flashes. */
  flash?: boolean
}

export function StatTile({ chartId, ariaLabel, variant = 'small', flash = false }: StatTileProps) {
  const stat = statFor(chartId)
  if (!stat) return null
  return (
    <div
      className={`stat stat--${variant}${flash ? ' stat--flash' : ''}`}
      role="img"
      aria-label={ariaLabel}
    >
      <div className="stat__figure">{stat.figure}</div>
      <div className="stat__context">{stat.context}</div>
    </div>
  )
}
