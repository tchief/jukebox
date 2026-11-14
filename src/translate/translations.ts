/**
 * Translations: measured features → abstract musical intents.
 *
 * This is where the science lives, so the rules are simple, monotonic and
 * written down in `legend` for listeners. One rule is never broken:
 * more of the measured quantity always sounds higher / more intense.
 */
import type { FrameFeatures, Intents } from '../core/types'
import { Registry, Module } from '../core/registry'
import { clamp01, mean, resample } from '../core/math'

/** Statistics of the whole timeline, used to give quiet videos enough contrast. */
export interface TimelineStats { minMean: number; maxMean: number; maxChange: number; maxFlash: number }

export function timelineStats(frames: FrameFeatures[]): TimelineStats {
  const means = frames.map((f) => f.mean)
  return {
    minMean: Math.min(...means, 1),
    maxMean: Math.max(...means, 0),
    maxChange: Math.max(1e-6, ...frames.map((f) => f.change)),
    maxFlash: Math.max(1e-6, ...frames.map((f) => f.flash)),
  }
}

export interface StepContext {
  stats: TimelineStats
  /** Which beat of the bar (the "needle" sweeps the frame once per bar). */
  beatInBar: number
  beatsPerBar: number
  subdivision: number
  /** Conductor spotlight: 0..1 west → east, or null for the automatic sweep. */
  spotlight: number | null
}

export interface Translation extends Module {
  /** Plain-language mapping shown to listeners and read by screen readers. */
  legend: string[]
  translate(f: FrameFeatures, ctx: StepContext): Intents
}

export const translations = new Registry<Translation>('translation')

/** Map the timeline mean range onto 0..1, keeping at least 25% of the range so noise isn't exaggerated. */
function normMean(x: number, s: TimelineStats) {
  const mid = (s.minMean + s.maxMean) / 2
  const half = Math.max(0.125, (s.maxMean - s.minMean) / 2)
  return clamp01(0.5 + (x - mid) / (2 * half))
}

/** The melody needle: which slice of the columns this beat reads. */
function needle(f: FrameFeatures, ctx: StepContext): { melody: number[]; pan: number[]; flashes: number[] } {
  const n = ctx.subdivision
  const cols = f.columns.length
  let start: number, end: number
  if (ctx.spotlight === null) {
    start = Math.floor((ctx.beatInBar / ctx.beatsPerBar) * cols)
    end = Math.floor(((ctx.beatInBar + 1) / ctx.beatsPerBar) * cols)
  } else {
    // Spotlight: a narrow window around the chosen longitude, repeated.
    const c = Math.round(ctx.spotlight * (cols - 1))
    start = Math.max(0, c - 1); end = Math.min(cols, c + 2)
  }
  const melody = resample(f.columns.slice(start, Math.max(start + 1, end)), n)
  const flashes = resample(f.flashColumns.slice(start, Math.max(start + 1, end)), n)
  const pan = melody.map((_, i) => {
    const x = (start + ((end - start) * (i + 0.5)) / n) / cols
    return Math.max(-1, Math.min(1, x * 2 - 1))
  })
  return { melody, pan, flashes }
}

function accents(flashes: number[], pan: number[], f: FrameFeatures, s: TimelineStats) {
  const global = clamp01(f.flash / s.maxFlash)
  return flashes.map((v, i) => ({ strength: clamp01(Math.max(v, global * 0.5) * (f.flash > 0.01 ? 1 : 0)), pan: pan[i] }))
}

/** Sequential quantities: temperature, CO₂, forest height, aerosol load. */
translations.add({
  id: 'sequential@1',
  label: 'Sequential (low → high)',
  legend: [
    'Higher average value → the harmony rises.',
    'The melody sweeps the map west → east once per bar; each note is the value under the needle (higher = more).',
    'More extreme areas (top of the colour scale) → more tension and the brass enters.',
    'Faster change between frames → more notes per beat.',
    'Sudden bright flashes → percussion, panned to where they happen.',
  ],
  translate(f, ctx) {
    const { melody, pan, flashes } = needle(f, ctx)
    const contour = normMean(f.mean, ctx.stats)
    return {
      contour,
      tension: clamp01(f.hot * 2.5 + f.spread * 0.3),
      density: clamp01(0.25 + (f.change / ctx.stats.maxChange) * 0.75),
      dynamics: clamp01(0.45 + f.coverage * 0.25 + f.hot * 0.3),
      brightness: clamp01(0.3 + contour * 0.6),
      melody, pan,
      accents: accents(flashes, pan, f, ctx.stats),
      layers: f.layers,
    }
  },
})

/** Diverging quantities: anomalies, where the middle of the colour scale means "normal". */
translations.add({
  id: 'diverging@1',
  label: 'Anomaly (normal in the middle)',
  legend: [
    'The middle of the colour scale is "normal". A soft reference tone marks it.',
    'Warmer than normal → the harmony rises; colder than normal → it falls.',
    'The further from normal, the more dissonant the chords and the louder the brass.',
    'The melody sweeps the map west → east; each note is the anomaly under the needle.',
  ],
  translate(f, ctx) {
    const { melody, pan, flashes } = needle(f, ctx)
    const deviation = mean(f.columns.map((c) => Math.abs(c - 0.5) * 2))
    return {
      contour: clamp01(f.mean),
      tension: clamp01(deviation * 1.4),
      density: clamp01(0.25 + (f.change / ctx.stats.maxChange) * 0.75),
      dynamics: clamp01(0.4 + deviation * 0.6),
      brightness: clamp01(0.3 + f.mean * 0.6),
      melody, pan,
      accents: accents(flashes, pan, f, ctx.stats),
      layers: f.layers,
    }
  },
})

/** Brightness as data: night lights, lightning, fires. */
translations.add({
  id: 'brightness@1',
  label: 'Brightness (light as data)',
  legend: [
    'Brighter map → higher harmony.',
    'The melody sweeps west → east; bright places (cities, storms) sound as high notes.',
    'Every flash of light (for example lightning) is a drum hit, panned to its longitude.',
    'More lit area → fuller, louder orchestra.',
  ],
  translate(f, ctx) {
    const { melody, pan, flashes } = needle(f, ctx)
    const contour = normMean(f.mean, ctx.stats)
    return {
      contour,
      tension: clamp01(f.hot * 3),
      density: clamp01(0.2 + (f.change / ctx.stats.maxChange) * 0.8),
      dynamics: clamp01(0.4 + f.mean * 0.6),
      brightness: clamp01(0.25 + contour * 0.7),
      melody: melody.map((v) => clamp01(v * 1.5)),
      pan,
      accents: accents(flashes, pan, f, ctx.stats),
      layers: f.layers,
    }
  },
})
