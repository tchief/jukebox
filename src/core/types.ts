/**
 * Core data contracts of Conduct the Earth.
 *
 *   Frames → Analyzer → FrameFeatures → Translation → Intents
 *          → MusicSystem → NoteEvent[] → Ensemble (voices) → sound
 *
 * Every layer talks to the next one only through these plain types, so any
 * module (analyzer, translation, tuning, scale, harmony, ensemble) can be
 * swapped without touching the rest.
 */

/** Features measured from one analysed video frame. All values are 0..1. */
export interface FrameFeatures {
  /** Time of the frame inside the source video, seconds. */
  time: number
  /** Mean data value of valid pixels (decoded through the colour scale). */
  mean: number
  /** Standard deviation of the data value. */
  spread: number
  /** Share of valid pixels that are "extreme" (value above 0.8). */
  hot: number
  /** Share of pixels that carry data at all (not background / land / text). */
  coverage: number
  /** Mean absolute change of the value grid vs. the previous frame. */
  change: number
  /** Share of pixels that suddenly became bright (flashes, lightning). */
  flash: number
  /** Mean value per column, west → east. */
  columns: number[]
  /** Mean value per row, north → south. */
  rows: number[]
  /** Flash strength per column (0 if none). */
  flashColumns: number[]
  /** Density 0..1 of each colour layer (for multi-layer visuals such as aerosols). */
  layers: number[]
}

/**
 * Abstract musical intentions for one step, independent of any scale,
 * tuning or instrument. All values 0..1.
 */
export interface Intents {
  /** Overall pitch height of the harmony (mean value). */
  contour: number
  /** Harmonic tension (anomalies, extremes). */
  tension: number
  /** Rhythmic density, notes per beat. */
  density: number
  /** Loudness. */
  dynamics: number
  /** Brightness of the timbre. */
  brightness: number
  /** Melody line: one value per sub-step, read west → east across the frame. */
  melody: number[]
  /** Stereo position of each melody value (-1 west … +1 east). */
  pan: number[]
  /** Percussive accents: strength 0..1 and pan, per sub-step. */
  accents: { strength: number; pan: number }[]
  /** Density of each colour layer → which sections play and how loud. */
  layers: number[]
}

/**
 * One sound event. Pitch is a fractional MIDI number: 60 = middle C,
 * 69 = A4, 69.5 = a quarter-tone above A4. Any tuning system fits.
 */
export interface NoteEvent {
  /** Fractional MIDI pitch, or NaN for unpitched (percussion, noise). */
  pitch: number
  /** Start, in beats from the beginning of the piece. */
  time: number
  /** Duration in beats. */
  dur: number
  /** 0..1 */
  velocity: number
  /** Which voice plays it: "pad", "bass", "melody", "brass", "perc", "ref", "tick", "layer:N". */
  voice: string
  /** Stereo position -1..1. */
  pan?: number
  /** Optional glide target (fractional MIDI), for continuous / raga-like systems. */
  glideTo?: number
}

/** The sections a conductor can bring in or out. */
export type SectionId = 'strings' | 'bass' | 'melody' | 'brass' | 'percussion'

export const SECTIONS: { id: SectionId; key: string; label: string; voices: string[] }[] = [
  { id: 'strings', key: 'a', label: 'Strings (harmony)', voices: ['pad'] },
  { id: 'bass', key: 's', label: 'Basses', voices: ['bass'] },
  { id: 'melody', key: 'd', label: 'Melody (west → east)', voices: ['melody'] },
  { id: 'brass', key: 'f', label: 'Brass (tension)', voices: ['brass'] },
  { id: 'percussion', key: 'g', label: 'Percussion (flashes)', voices: ['perc'] },
]

/** A complete, reproducible description of one sonification variant. */
export interface Recipe {
  id: string
  label: string
  /** Translation module id (features → intents). Empty = use the visualisation's default. */
  translation?: string
  /** Music system: tuning + scale + harmony ids, root pitch. */
  system: { tuning: string; scale: string; harmony: string; root: number }
  /** Ensemble id (how events sound). */
  ensemble: string
  /** Base tempo, BPM. */
  bpm: number
  /** Melody sub-steps per beat. */
  subdivision: number
}
