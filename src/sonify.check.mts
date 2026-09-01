/**
 * sonify.check.mts — browserless unit checks for the PURE parts of sonify.ts.
 *
 * Audio playback needs a real browser gesture and can't be heard headless, so
 * this asserts only the deterministic mapping/timing math that the audio graph
 * is built from:
 *   - valueToFreq: min→220, max→880, monotonic, flat→mid.
 *   - stepMs: totalMs / N step time.
 *   - peakIndex: index of the true maximum.
 *   - downsample: caps step count, preserves the true peak value + ~position.
 *
 * The module is imported for real (proving it has no browser globals at the top
 * level). Run:  npx tsx src/sonify.check.mts
 */

import assert from 'node:assert/strict'
import {
  FREQ_MIN,
  FREQ_MAX,
  DURATION_MS,
  MAX_STEPS,
  valueToFreq,
  peakIndex,
  stepMs,
  downsample,
} from './sonify.ts'

function approx(a: number, b: number, eps = 1e-9): boolean {
  return Math.abs(a - b) <= eps
}

// --- valueToFreq: endpoints + monotonicity ---------------------------------
{
  const min = 5.6
  const max = 12.11 // maize peak
  assert.ok(approx(valueToFreq(min, min, max), FREQ_MIN), 'series min → 220 Hz')
  assert.ok(approx(valueToFreq(max, min, max), FREQ_MAX), 'series max → 880 Hz')
  assert.ok(approx(valueToFreq((min + max) / 2, min, max), (FREQ_MIN + FREQ_MAX) / 2), 'midpoint → mid Hz')

  // Strictly monotonic increasing across the value domain.
  let prev = -Infinity
  for (let v = min; v <= max; v += (max - min) / 40) {
    const f = valueToFreq(v, min, max)
    assert.ok(f > prev, `valueToFreq monotonic increasing at v=${v}`)
    assert.ok(f >= FREQ_MIN - 1e-9 && f <= FREQ_MAX + 1e-9, `valueToFreq in [220,880] at v=${v}`)
    prev = f
  }

  // Flat series has no gradient → mid frequency (no divide-by-zero).
  assert.ok(approx(valueToFreq(7, 7, 7), (FREQ_MIN + FREQ_MAX) / 2), 'flat series → mid frequency')
}

// --- stepMs: total duration / N --------------------------------------------
{
  assert.ok(approx(stepMs(30, 3000), 100), '30 steps over 3000ms → 100ms/step')
  assert.ok(approx(stepMs(MAX_STEPS, DURATION_MS), DURATION_MS / MAX_STEPS), 'default step time = 3000/72')
  // Regardless of N the TOTAL stays ~3s: N * stepMs(N) === totalMs.
  for (const n of [25, 30, 72, 115]) {
    assert.ok(approx(n * stepMs(n, DURATION_MS), DURATION_MS), `N=${n}: N × stepMs = total ${DURATION_MS}ms`)
  }
}

// --- peakIndex --------------------------------------------------------------
{
  assert.equal(peakIndex([1, 3, 2]), 1, 'peak in the middle')
  assert.equal(peakIndex([5, 4, 3]), 0, 'peak at the start')
  assert.equal(peakIndex([1, 2, 9]), 2, 'peak at the end')
  // Maize-like: 115 points, peak (12.11) somewhere in the interior.
  const maizeish = Array.from({ length: 115 }, (_, i) => 5 + Math.sin(i / 10) * 2)
  maizeish[97] = 12.11 // plant the true peak
  assert.equal(peakIndex(maizeish), 97, 'finds the planted maize peak at index 97')
}

// --- downsample: caps steps, preserves the true peak -----------------------
{
  // Short series: returned unchanged.
  const shortS = [1, 2, 3, 4]
  assert.deepEqual(downsample(shortS, MAX_STEPS), shortS, 'short series unchanged')

  // Long series (115) with a planted unique max → ≤ MAX_STEPS steps, and the
  // max value survives at roughly its original relative position.
  const n = 115
  const long = Array.from({ length: n }, (_, i) => 5 + Math.sin(i / 9) * 1.5)
  const peakSrc = 97
  long[peakSrc] = 12.11
  const ds = downsample(long, MAX_STEPS)
  assert.ok(ds.length <= MAX_STEPS, `down-sampled to ${ds.length} ≤ ${MAX_STEPS} steps`)
  const dsPeak = peakIndex(ds)
  assert.ok(approx(ds[dsPeak], 12.11), 'true max value (12.11) survives down-sampling')
  // Position preserved to within one step's worth of the series.
  const relSrc = peakSrc / (n - 1)
  const relDs = dsPeak / (ds.length - 1)
  assert.ok(Math.abs(relSrc - relDs) < 1.5 / ds.length, `peak position preserved (src ${relSrc.toFixed(2)} vs ds ${relDs.toFixed(2)})`)
}

console.log('ok — sonify pure math: valueToFreq (220↔880, monotonic, flat→mid), stepMs (total ~3s ∀N), peakIndex, downsample (peak preserved). all assertions passed')
