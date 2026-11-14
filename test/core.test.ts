import { describe, expect, it } from 'vitest'
import { analyzeFrame } from '../src/analysis/analyze'
import { hueScale, luminanceScale, lutScale, stopsFromColorbar, THERMAL_STOPS } from '../src/analysis/colorscale'
import { translations, timelineStats } from '../src/translate/translations'
import { pitchFor, scales, scalePitches, tunings, harmonies } from '../src/music/system'
import { buildScore } from '../src/core/score'
import { RECIPES } from '../src/core/recipes'
import { evaluate } from '../src/export/evaluate'
import { chooseMedia, collectMedia, proxied } from '../src/sources/sources'
import { scoreToMidi } from '../src/export/files'
import type { FrameFeatures } from '../src/core/types'

/** A W×H frame filled by f(x, y) → RGB. */
function frame(w: number, h: number, f: (x: number, y: number) => [number, number, number]) {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [r, g, b] = f(x, y), o = (y * w + x) * 4
    data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = 255
  }
  return { width: w, height: h, data }
}
const thermal = lutScale('thermal', 'thermal', THERMAL_STOPS)
const colorAt = (t: number) => THERMAL_STOPS[Math.round(t * (THERMAL_STOPS.length - 1))]

describe('colour scales', () => {
  it('decodes thermal colours back to their value', () => {
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const [r, g, b] = colorAt(t)
      expect(thermal.decode(r, g, b).t).toBeCloseTo(t, 1)
    }
  })
  it('ignores grey land and black background in the rainbow scale', () => {
    expect(hueScale().decode(90, 90, 90).valid).toBe(false)
    expect(hueScale().decode(0, 0, 0).valid).toBe(false)
    expect(hueScale().decode(0, 0, 255).t).toBeLessThan(hueScale().decode(255, 0, 0).t)
  })
  it('reads a horizontal colour bar low → high', () => {
    const bar = frame(100, 10, (x) => colorAt(x / 99))
    const stops = stopsFromColorbar(bar, 16)
    const s = lutScale('bar', 'bar', stops)
    expect(s.decode(...colorAt(0.1)).t).toBeLessThan(s.decode(...colorAt(0.9)).t)
  })
})

describe('analyser', () => {
  it('measures a warm east and a cold west', () => {
    const f = analyzeFrame(frame(64, 32, (x) => colorAt(x / 63)), thermal, 0)
    expect(f.columns[0]).toBeLessThan(f.columns[f.columns.length - 1])
    expect(f.mean).toBeGreaterThan(0.4); expect(f.mean).toBeLessThan(0.6)
    expect(f.coverage).toBeCloseTo(1, 1)
  })
  it('detects flashes between frames', () => {
    const state = {}
    analyzeFrame(frame(32, 16, () => [0, 0, 0]), luminanceScale(), 0, state)
    const f = analyzeFrame(frame(32, 16, (x, y) => (x > 24 && y < 4 ? [255, 255, 255] : [0, 0, 0])), luminanceScale(), 0.5, state)
    expect(f.flash).toBeGreaterThan(0)
    expect(f.flashColumns.slice(-4).some((v) => v > 0)).toBe(true)
    expect(f.flashColumns[0]).toBe(0)
  })
})

const feat = (mean: number, hot = 0, columns?: number[]): FrameFeatures => ({
  time: 0, mean, spread: 0.1, hot, coverage: 1, change: 0.1, flash: 0,
  columns: columns ?? new Array(32).fill(mean), rows: new Array(16).fill(mean),
  flashColumns: new Array(32).fill(0), layers: [0, 0, 0, 0, 0, 0],
})

describe('translations never flip the meaning', () => {
  for (const tr of translations.list()) {
    it(`${tr.id}: higher value → higher contour and melody, more extremes → more tension`, () => {
      const stats = { minMean: 0, maxMean: 1, maxChange: 1, maxFlash: 1 }
      const ctx = { stats, beatInBar: 0, beatsPerBar: 4, subdivision: 4, spotlight: null }
      let prev = -Infinity, prevMel = -Infinity, prevT = -Infinity
      for (let m = 0; m <= 1.0001; m += 0.05) {
        const it = tr.translate(feat(m), ctx)
        expect(it.contour).toBeGreaterThanOrEqual(prev); prev = it.contour
        expect(it.melody[0]).toBeGreaterThanOrEqual(prevMel); prevMel = it.melody[0]
      }
      for (let h = 0; h <= 1.0001; h += 0.05) {
        const it = tr.translate(feat(0.5, h), ctx)
        if (tr.id !== 'diverging@1') { expect(it.tension).toBeGreaterThanOrEqual(prevT); prevT = it.tension }
      }
    })
  }
})

describe('music systems', () => {
  it('pitchFor is monotonic for every scale and tuning', () => {
    for (const s of scales.list()) for (const tu of tunings.list()) {
      let prev = -Infinity
      for (let t = 0; t <= 1.0001; t += 0.01) {
        const p = pitchFor(t, s, tu, 62, 62, 86)
        expect(p).toBeGreaterThanOrEqual(prev - 1e-9)
        prev = p
      }
    }
  })
  it('scale notes stay in the scale', () => {
    const major = scales.get('major'), et = tunings.get('12-tet')
    const allowed = new Set(scalePitches(major, et, 62, 0, 127).map((p) => Math.round(p * 100)))
    for (let t = 0; t <= 1; t += 0.03) expect(allowed.has(Math.round(pitchFor(t, major, et, 62, 62, 86) * 100))).toBe(true)
  })
  it('just intonation gives fractional MIDI (micro-tones)', () => {
    const third = tunings.get('just').adjust(400)
    expect(third).toBeCloseTo(386.31, 1)
  })
  it('tense chords are bigger than calm ones', () => {
    const h = harmonies.get('calm-to-tense'), s = scales.get('major'), t = tunings.get('12-tet')
    expect(h.chord(0.9, 0.5, s, t, 62).length).toBeGreaterThan(h.chord(0.1, 0.5, s, t, 62).length)
  })
})

describe('scores', () => {
  const beats = Array.from({ length: 32 }, (_, i) => feat(i / 31, i > 24 ? 0.3 : 0, Array.from({ length: 32 }, (_, c) => (c / 31) * 0.5 + (i / 31) * 0.5)))
  for (const recipe of RECIPES) {
    it(`${recipe.id}: deterministic and the data is recoverable`, () => {
      const a = buildScore({ beats, recipe, translation: 'sequential@1' })
      const b = buildScore({ beats, recipe, translation: 'sequential@1' })
      expect(a).toEqual(b)
      expect(a.length).toBeGreaterThan(0)
      const q = evaluate(beats, recipe, 'sequential@1')
      expect(q.fidelity).toBeGreaterThan(0.9)
    })
  }
  it('exports MIDI', () => {
    const ev = buildScore({ beats, recipe: RECIPES[0], translation: 'sequential@1' })
    const bytes = scoreToMidi(ev, 72, 'test')
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('MThd')
  })
  it('timeline stats', () => {
    const s = timelineStats(beats)
    expect(s.minMean).toBe(0); expect(s.maxMean).toBe(1)
  })
})

describe('SVS API parsing', () => {
  const api = {
    id: 3912, media_groups: [{ items: [
      { instance: { url: 'https://svs.gsfc.nasa.gov/vis/a000000/a003900/a003912/sst_print.jpg', filename: 'sst_print.jpg', width: 3000, height: 1500 } },
      { instance: { url: 'https://svs.gsfc.nasa.gov/vis/a000000/a003900/a003912/sst_1280x720.mp4', filename: 'sst_1280x720.mp4', width: 1280, height: 720 } },
      { instance: { url: 'https://svs.gsfc.nasa.gov/vis/a000000/a003900/a003912/sst_3840x2160.mp4', filename: 'sst_3840x2160.mp4', width: 3840, height: 2160 } },
      { instance: { url: 'https://svs.gsfc.nasa.gov/vis/a000000/a003900/a003912/colorbar_sst.png', filename: 'colorbar_sst.png', width: 1024, height: 64 } },
    ] }],
  }
  it('finds a light video and the colour bar', () => {
    const m = chooseMedia(collectMedia(api))
    expect(m.video?.filename).toBe('sst_1280x720.mp4')
    expect(m.colorbar?.filename).toBe('colorbar_sst.png')
  })
  it('rewrites SVS URLs to the proxy', () => {
    expect(proxied('https://svs.gsfc.nasa.gov/vis/a/b.mp4')).toBe('/svs/vis/a/b.mp4')
    expect(proxied('https://example.com/x')).toBe('https://example.com/x')
  })
})
