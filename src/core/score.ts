/**
 * Score building: the whole chain features → intents → events for one beat,
 * and for a whole piece (used by export and the evaluation metrics).
 */
import type { FrameFeatures, NoteEvent, Recipe } from './types'
import { translations, timelineStats, type TimelineStats } from '../translate/translations'
import { renderStep } from '../music/system'

export const BEATS_PER_BAR = 4

export interface ScoreInput {
  /** One feature sample per beat. */
  beats: FrameFeatures[]
  recipe: Recipe
  translation: string
}

export function eventsForBeat(
  input: ScoreInput,
  beat: number,
  stats: TimelineStats,
  spotlight: number | null = null,
): NoteEvent[] {
  const f = input.beats[beat]
  if (!f) return []
  const tr = translations.get(input.recipe.translation || input.translation)
  const beatInBar = beat % BEATS_PER_BAR
  const intents = tr.translate(f, { stats, beatInBar, beatsPerBar: BEATS_PER_BAR, subdivision: input.recipe.subdivision, spotlight })
  return renderStep({ intents, beat, beatInBar, beatsPerBar: BEATS_PER_BAR, subdivision: input.recipe.subdivision }, input.recipe.system)
}

/** Full deterministic score (autopilot, no human input). */
export function buildScore(input: ScoreInput): NoteEvent[] {
  const stats = timelineStats(input.beats)
  const out: NoteEvent[] = []
  for (let b = 0; b < input.beats.length; b++) out.push(...eventsForBeat(input, b, stats))
  return out
}
