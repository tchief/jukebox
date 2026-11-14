/**
 * Music systems: intents → NoteEvents.
 *
 * A "musical language" is three swappable modules:
 *   Tuning  – how scale steps (in cents) become exact pitches (12-TET, just intonation…)
 *   Scale   – which pitches are allowed (major, dorian, pentatonic, raga- or gamelan-inspired…)
 *   Harmony – which chords answer a given tension (or none at all)
 * Pitches are fractional MIDI numbers, so micro-tonal systems need no special case.
 */
import type { Intents, NoteEvent } from '../core/types'
import { Registry, Module } from '../core/registry'
import { clamp01 } from '../core/math'

// ───────────────────────────── Tunings ─────────────────────────────

export interface Tuning extends Module { adjust(cents: number): number }
export const tunings = new Registry<Tuning>('tuning')

tunings.add({ id: '12-tet', label: 'Equal temperament (12-TET)', adjust: (c) => c })

const JUST: [number, number][] = [
  [0, 0], [100, 111.73], [200, 203.91], [300, 315.64], [400, 386.31], [500, 498.04],
  [600, 590.22], [700, 701.96], [800, 813.69], [900, 884.36], [1000, 1017.6], [1100, 1088.27],
]
tunings.add({
  id: 'just',
  label: 'Just intonation (pure ratios)',
  adjust(c) {
    const oct = Math.floor(c / 1200), r = c - oct * 1200
    let best = JUST[0]
    for (const j of JUST) if (Math.abs(j[0] - r) < Math.abs(best[0] - r)) best = j
    return oct * 1200 + best[1] + (r - best[0])
  },
})

// ───────────────────────────── Scales ──────────────────────────────

export interface Scale extends Module {
  /** Degrees within one octave, in cents. Empty = continuous pitch (no scale). */
  cents: number[]
}
export const scales = new Registry<Scale>('scale')

scales.add({ id: 'major', label: 'Major (bright)', cents: [0, 200, 400, 500, 700, 900, 1100] })
scales.add({ id: 'minor', label: 'Natural minor (dark)', cents: [0, 200, 300, 500, 700, 800, 1000] })
scales.add({ id: 'dorian', label: 'Dorian (thoughtful)', cents: [0, 200, 300, 500, 700, 900, 1000] })
scales.add({ id: 'pentatonic', label: 'Major pentatonic (no wrong notes)', cents: [0, 200, 400, 700, 900] })
scales.add({ id: 'whole-tone', label: 'Whole-tone (floating, "space")', cents: [0, 200, 400, 600, 800, 1000] })
scales.add({ id: 'yaman-inspired', label: 'Inspired by raga Yaman (evening)', cents: [0, 200, 400, 600, 700, 900, 1100], tags: ['inspired'] })
scales.add({ id: 'pelog-inspired', label: 'Inspired by gamelan pelog (approximate)', cents: [0, 120, 270, 540, 670, 785, 950], tags: ['inspired', 'microtonal'] })
scales.add({ id: 'continuous', label: 'Continuous pitch (no scale, for exact listening)', cents: [] })

/** All allowed fractional-MIDI pitches of a scale between lo and hi. */
export function scalePitches(scale: Scale, tuning: Tuning, root: number, lo: number, hi: number): number[] {
  if (!scale.cents.length) return []
  const out: number[] = []
  for (let oct = -6; oct <= 6; oct++) {
    for (const c of scale.cents) {
      const p = root + tuning.adjust(oct * 1200 + c) / 100
      if (p >= lo - 1e-9 && p <= hi + 1e-9) out.push(p)
    }
  }
  return out.sort((a, b) => a - b)
}

/** Monotonic map value 0..1 → pitch in [lo, hi]. Higher value never gives a lower note. */
export function pitchFor(t: number, scale: Scale, tuning: Tuning, root: number, lo: number, hi: number): number {
  t = clamp01(t)
  if (!scale.cents.length) return lo + t * (hi - lo)
  const ps = scalePitches(scale, tuning, root, lo, hi)
  return ps[Math.round(t * (ps.length - 1))]
}

// ───────────────────────────── Harmonies ───────────────────────────

export interface Harmony extends Module {
  /** Chord (fractional MIDI pitches) for a tension and register. */
  chord(tension: number, contour: number, scale: Scale, tuning: Tuning, root: number): number[]
}
export const harmonies = new Registry<Harmony>('harmony')

/** Chords ordered from calm to tense; tension picks along this path. */
const CALM_TO_TENSE = [0, 5, 3, 1, 4, 2, 6]

harmonies.add({
  id: 'calm-to-tense',
  label: 'Calm → tense chords',
  chord(tension, contour, scale, tuning, root) {
    const deg = scale.cents.length || 1
    const pick = CALM_TO_TENSE.filter((d) => d < deg)
    const rootDeg = pick[Math.min(pick.length - 1, Math.floor(clamp01(tension) * pick.length))]
    const size = tension < 0.35 ? 3 : tension < 0.7 ? 4 : 5
    // Register follows the contour: one octave of travel.
    const base = root - 12 + Math.round(clamp01(contour) * 12)
    const notes: number[] = []
    for (let k = 0; k < size; k++) {
      const d = rootDeg + 2 * k
      const oct = Math.floor(d / deg)
      const c = scale.cents.length ? scale.cents[d % deg] : 0
      notes.push(base + tuning.adjust(oct * 1200 + c) / 100)
    }
    // Strong extremes: add a semitone clash for audible alarm.
    if (tension > 0.8) notes.push(notes[0] + 13)
    return notes
  },
})

harmonies.add({
  id: 'drone',
  label: 'Single drone (no chords)',
  chord(_tension, contour, scale, tuning, root) {
    return [pitchFor(contour, scale, tuning, root - 12, root - 12, root)]
  },
})

// ───────────────────────────── Rendering ───────────────────────────

export interface SystemConfig { tuning: string; scale: string; harmony: string; root: number }

export interface RenderStep {
  intents: Intents
  /** Absolute beat index of this step. */
  beat: number
  beatInBar: number
  beatsPerBar: number
  subdivision: number
}

/** Melody register (fractional MIDI). */
export const MELODY_RANGE: [number, number] = [62, 86]

/**
 * Turn one beat of intents into events. Deterministic: the same inputs
 * always give the same notes.
 */
export function renderStep(step: RenderStep, cfg: SystemConfig): NoteEvent[] {
  const tuning = tunings.get(cfg.tuning), scale = scales.get(cfg.scale), harmony = harmonies.get(cfg.harmony)
  const { intents: it, beat, beatInBar, beatsPerBar, subdivision } = step
  const ev: NoteEvent[] = []
  const dyn = clamp01(it.dynamics)

  if (beatInBar === 0) {
    const chord = harmony.chord(it.tension, it.contour, scale, tuning, cfg.root)
    for (const p of chord) ev.push({ pitch: p, time: beat, dur: beatsPerBar, velocity: 0.35 + dyn * 0.35, voice: 'pad' })
    ev.push({ pitch: chord[0] - 12, time: beat, dur: beatsPerBar / 2, velocity: 0.5 + dyn * 0.3, voice: 'bass' })
    if (it.tension > 0.55) {
      const v = clamp01((it.tension - 0.55) * 2.2)
      for (const p of chord.slice(-3)) ev.push({ pitch: p, time: beat, dur: beatsPerBar, velocity: 0.15 + v * 0.6, voice: 'brass' })
    }
    // Sound landmarks: a soft "normal" reference tone and a time tick each bar.
    ev.push({ pitch: pitchFor(0.5, scale, tuning, cfg.root, MELODY_RANGE[0], MELODY_RANGE[1]), time: beat, dur: 0.5, velocity: 0.25, voice: 'ref' })
    ev.push({ pitch: NaN, time: beat, dur: 0.05, velocity: 0.4, voice: 'tick' })
  }
  if (beatInBar === Math.floor(beatsPerBar / 2)) {
    const chord = harmony.chord(it.tension, it.contour, scale, tuning, cfg.root)
    ev.push({ pitch: chord[0] - 12, time: beat, dur: beatsPerBar / 2, velocity: 0.4 + dyn * 0.3, voice: 'bass' })
  }

  // Melody: density decides how many of the sub-steps sound.
  const every = it.density > 0.75 ? 1 : it.density > 0.45 ? 2 : subdivision
  const sub = 1 / subdivision
  for (let i = 0; i < subdivision; i += every) {
    const p = pitchFor(it.melody[i] ?? it.contour, scale, tuning, cfg.root, MELODY_RANGE[0], MELODY_RANGE[1])
    ev.push({ pitch: p, time: beat + i * sub, dur: sub * every * 0.95, velocity: 0.35 + dyn * 0.5, voice: 'melody', pan: it.pan[i] ?? 0 })
  }

  // Percussion for flashes.
  it.accents.forEach((a, i) => {
    if (a.strength > 0.15) ev.push({ pitch: NaN, time: beat + i * sub, dur: 0.1, velocity: a.strength, voice: 'perc', pan: a.pan })
  })

  // Colour layers (multi-track visuals): each colour family is a sustained voice.
  if (beatInBar === 0) {
    it.layers.forEach((d, i) => {
      if (d > 0.05) ev.push({ pitch: pitchFor(i / 5, scale, tuning, cfg.root, 48, 72), time: beat, dur: beatsPerBar, velocity: clamp01(d) * 0.6, voice: `layer:${i}` })
    })
  }
  return ev
}
