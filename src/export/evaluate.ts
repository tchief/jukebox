/**
 * Evaluation of a sonification variant, computed from the score:
 * - fidelity: can the data be recovered from what you hear? (reverse test)
 * - smoothness: share of melodic steps that are easy to follow (≤ a fifth)
 * - flash timing: are percussion hits where the flashes are?
 */
import type { FrameFeatures, NoteEvent, Recipe } from '../core/types'
import { BEATS_PER_BAR } from '../core/score'
import { translations, timelineStats } from '../translate/translations'
import { renderStep } from '../music/system'
import { correlation } from '../core/math'

export interface Evaluation { fidelity: number; smoothness: number; notes: number; flashHits: number; flashes: number }

export function evaluate(beats: FrameFeatures[], recipe: Recipe, translation: string): Evaluation {
  const stats = timelineStats(beats)
  const tr = translations.get(recipe.translation || translation)
  const values: number[] = [], pitches: number[] = []
  let flashes = 0, flashHits = 0
  const melody: NoteEvent[] = []
  beats.forEach((f, beat) => {
    const beatInBar = beat % BEATS_PER_BAR
    const it = tr.translate(f, { stats, beatInBar, beatsPerBar: BEATS_PER_BAR, subdivision: recipe.subdivision, spotlight: null })
    const ev = renderStep({ intents: it, beat, beatInBar, beatsPerBar: BEATS_PER_BAR, subdivision: recipe.subdivision }, recipe.system)
    const mel = ev.filter((e) => e.voice === 'melody')
    mel.forEach((e) => {
      const i = Math.round((e.time - beat) * recipe.subdivision)
      values.push(it.melody[i]); pitches.push(e.pitch)
    })
    melody.push(...mel)
    const strong = it.accents.filter((a) => a.strength > 0.15).length
    flashes += it.accents.filter((a) => a.strength > 0.15).length
    flashHits += Math.min(strong, ev.filter((e) => e.voice === 'perc').length)
  })
  let smooth = 0
  for (let i = 1; i < melody.length; i++) if (Math.abs(melody[i].pitch - melody[i - 1].pitch) <= 7) smooth++
  return {
    fidelity: correlation(values, pitches),
    smoothness: melody.length > 1 ? smooth / (melody.length - 1) : 1,
    notes: melody.length, flashes, flashHits,
  }
}
