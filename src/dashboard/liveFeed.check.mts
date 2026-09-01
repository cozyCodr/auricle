/**
 * liveFeed.check.mts — browserless unit check of the ticking session store (4.3).
 * Drives `tick()` directly (no timers, no browser) and asserts the walk stays
 * bounded, the buffer/stats accumulate, and the seed is the real close.
 * Run: `npx tsx src/dashboard/liveFeed.check.mts`
 */
import {
  tick,
  getSessionStats,
  getCurrentRate,
  getSeed,
  getLiveValues,
  __resetLiveFeedForTests,
  BAND_PCT,
  STEP_PCT,
} from './liveFeed.ts'
import { exchange } from './charts.ts'

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
}

const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d

__resetLiveFeedForTests()

const seed = getSeed()
const realLast = exchange.points[exchange.points.length - 1].y
assert(seed === realLast, `seed is the real last close (${seed} === ${realLast})`)

// Tick #0 state.
let s = getSessionStats()
assert(s.tickCount === 0, 'starts at 0 ticks')
assert(s.min === seed && s.max === seed && s.range === 0, 'stats seeded to the seed')
assert(getLiveValues().length === exchange.points.length, 'live values == baseline before any tick')

// Drive 200 ticks; assert bounds + accumulation.
const lo = seed * (1 - BAND_PCT)
const hi = seed * (1 + BAND_PCT)
let prev = getCurrentRate()
for (let i = 1; i <= 200; i++) {
  tick()
  const cur = getCurrentRate()
  assert(cur >= lo - 1e-9 && cur <= hi + 1e-9, `tick ${i} within ±${BAND_PCT * 100}% band`)
  const stepFrac = Math.abs(cur - prev) / prev
  assert(stepFrac <= STEP_PCT + 1e-9, `tick ${i} step ≤ ${STEP_PCT * 100}%`)
  prev = cur
}

s = getSessionStats()
assert(s.tickCount === 200, `tickCount == 200 (got ${s.tickCount})`)
assert(s.count === 201, 'buffer == seed + 200 ticks')
assert(s.min <= seed && s.max >= s.min, 'min/max track the walk')
assert(round(s.range) === round(s.max - s.min), 'range == max − min')
assert(getLiveValues().length === exchange.points.length + 200, 'live values == baseline + ticks')

console.log(
  `ok — liveFeed store: seed=${round(seed)} (real close), 200 bounded ticks ` +
    `(±${STEP_PCT * 100}%/tick, clamped ±${BAND_PCT * 100}%), tickCount/min/max/range/buffer all track. ` +
    `range after 200 ticks: ${round(s.min)}–${round(s.max)}.`,
)
__resetLiveFeedForTests()
