/**
 * Frame analyser: pixels → FrameFeatures.
 * Works on a small down-sampled copy of the frame (e.g. 160×80) so it runs
 * in real time and gives the same result in the browser and in tests.
 */
import type { FrameFeatures } from '../core/types'
import { ColorScale, hueFamily, luminance } from './colorscale'

export interface PixelFrame { width: number; height: number; data: Uint8ClampedArray }

export interface AnalyzeOptions {
  columns: number
  rows: number
  /** Count colour families as layers (multi-layer visuals). */
  layers: boolean
  /** Brightness jump counted as a flash. */
  flashThreshold: number
}

export const DEFAULT_ANALYZE: AnalyzeOptions = { columns: 32, rows: 16, layers: true, flashThreshold: 0.35 }

/** State kept between frames (for change and flashes). */
export interface AnalyzerState { prevGrid?: Float32Array; prevLum?: Float32Array }

export function analyzeFrame(
  frame: PixelFrame,
  scale: ColorScale,
  time: number,
  state: AnalyzerState = {},
  opts: AnalyzeOptions = DEFAULT_ANALYZE,
): FrameFeatures {
  const { width: w, height: h, data } = frame
  const grid = new Float32Array(w * h).fill(NaN)
  const lum = new Float32Array(w * h)
  const colSum = new Float64Array(opts.columns), colN = new Float64Array(opts.columns)
  const rowSum = new Float64Array(opts.rows), rowN = new Float64Array(opts.rows)
  const flashCol = new Float64Array(opts.columns), flashColN = new Float64Array(opts.columns)
  const fam = new Float64Array(6)
  let sum = 0, sum2 = 0, n = 0, hot = 0, flash = 0, change = 0, changeN = 0

  for (let y = 0; y < h; y++) {
    const row = Math.min(opts.rows - 1, Math.floor((y / h) * opts.rows))
    for (let x = 0; x < w; x++) {
      const i = y * w + x, o = i * 4
      const r = data[o], g = data[o + 1], b = data[o + 2]
      const col = Math.min(opts.columns - 1, Math.floor((x / w) * opts.columns))
      const L = luminance(r, g, b)
      lum[i] = L
      if (state.prevLum) {
        const jump = L - state.prevLum[i]
        flashColN[col]++
        if (jump > opts.flashThreshold) { flash++; flashCol[col]++ }
      }
      if (opts.layers) {
        const f = hueFamily(r, g, b)
        if (f >= 0) fam[f]++
      }
      const d = scale.decode(r, g, b)
      if (!d.valid) continue
      grid[i] = d.t
      sum += d.t; sum2 += d.t * d.t; n++
      if (d.t > 0.8) hot++
      colSum[col] += d.t; colN[col]++
      rowSum[row] += d.t; rowN[row]++
      const pv = state.prevGrid?.[i]
      if (pv !== undefined && !Number.isNaN(pv)) { change += Math.abs(d.t - pv); changeN++ }
    }
  }

  const total = w * h
  const m = n ? sum / n : 0
  // Columns/rows without data take the overall mean, so silence is not mistaken for "cold".
  const columns = Array.from(colSum, (s, i) => (colN[i] ? s / colN[i] : m))
  const rows = Array.from(rowSum, (s, i) => (rowN[i] ? s / rowN[i] : m))
  const flashColumns = Array.from(flashCol, (s, i) => (flashColN[i] ? Math.min(1, (s / flashColN[i]) * 20) : 0))

  state.prevGrid = grid
  state.prevLum = lum

  return {
    time,
    mean: m,
    spread: n ? Math.sqrt(Math.max(0, sum2 / n - m * m)) * 2 : 0,
    hot: n ? hot / n : 0,
    coverage: n / total,
    change: changeN ? Math.min(1, (change / changeN) * 10) : 0,
    flash: Math.min(1, (flash / total) * 50),
    columns, rows, flashColumns,
    layers: Array.from(fam, (c) => Math.min(1, (c / total) * 3)),
  }
}
