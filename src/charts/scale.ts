/**
 * scale.ts — tiny pure SVG helpers shared by the chart components.
 *
 * No dependencies, no D3: a linear scale, padded bounds, a path builder, and the
 * generic gap-splitter that lets a line BREAK across a real data gap instead of
 * interpolating a straight line across missing months.
 */

import type { LinePoint } from './types.ts'

/** Linear map from a data span [dMin,dMax] onto a pixel span [rMin,rMax]. */
export function linScale(dMin: number, dMax: number, rMin: number, rMax: number): (v: number) => number {
  const span = dMax - dMin || 1
  return (v: number) => rMin + ((v - dMin) / span) * (rMax - rMin)
}

/** Min/max of `y` across points, padded by `pad` (fraction of range) for headroom. */
export function yBounds(points: readonly LinePoint[], pad = 0.08): { min: number; max: number } {
  const ys = points.map((p) => p.y)
  let min = Math.min(...ys)
  let max = Math.max(...ys)
  const range = max - min || Math.abs(max) || 1
  min -= range * pad
  max += range * pad
  return { min, max }
}

/** Min/max of `x` across points (no padding — time/category axes sit flush). */
export function xBounds(points: readonly LinePoint[]): { min: number; max: number } {
  const xs = points.map((p) => p.x)
  return { min: Math.min(...xs), max: Math.max(...xs) }
}

/** An SVG path `d` for one contiguous run of points. */
export function buildPath(
  points: readonly LinePoint[],
  sx: (v: number) => number,
  sy: (v: number) => number,
): string {
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`)
    .join(' ')
}

/**
 * Split a sorted point series into contiguous segments, breaking wherever the
 * gap between consecutive x values is abnormally large.
 *
 * The threshold is derived from the data itself — the median spacing between
 * points times `factor` — so it needs no per-chart tuning: a monthly series
 * (median step 1 month) breaks on any gap over ~1.75 months; a yearly series
 * breaks on any gap over ~1.75 years. This is what makes a gappy line render
 * as two polylines across its real 2022-08 → 2023-11 data gap.
 */
export function computeSegments(points: readonly LinePoint[], factor = 1.75): LinePoint[][] {
  if (points.length < 2) return [points.slice()]

  const steps: number[] = []
  for (let i = 1; i < points.length; i++) steps.push(points[i].x - points[i - 1].x)
  const sorted = [...steps].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)] || 1
  const threshold = median * factor

  const segments: LinePoint[][] = [[points[0]]]
  for (let i = 1; i < points.length; i++) {
    if (points[i].x - points[i - 1].x > threshold) segments.push([points[i]])
    else segments[segments.length - 1].push(points[i])
  }
  return segments
}

/**
 * Linear mix of two #rrggbb colors, t in [0,1] (0 → a, 1 → b). The small ramp
 * helper behind the warming-stripes diverging colormap — no d3 required.
 */
export function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16)
  const pb = parseInt(b.slice(1), 16)
  const clamp = Math.max(0, Math.min(1, t))
  const ch = (shift: number) => {
    const va = (pa >> shift) & 0xff
    const vb = (pb >> shift) & 0xff
    return Math.round(va + (vb - va) * clamp)
  }
  const to2 = (v: number) => v.toString(16).padStart(2, '0')
  return `#${to2(ch(16))}${to2(ch(8))}${to2(ch(0))}`
}

/** Pick `count` roughly evenly spaced points to use as axis ticks (always includes first + last). */
export function pickTicks<T>(items: readonly T[], count: number): T[] {
  if (items.length <= count) return items.slice()
  const out: T[] = []
  for (let i = 0; i < count; i++) {
    const idx = Math.round((i / (count - 1)) * (items.length - 1))
    out.push(items[idx])
  }
  return out
}
