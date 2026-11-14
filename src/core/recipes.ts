/**
 * Recipes: named, reproducible combinations of modules. Same recipe + same
 * frames → same score, so variants can be compared side by side.
 */
import type { Recipe } from './types'

export const RECIPES: Recipe[] = [
  {
    id: 'orchestra', label: 'Orchestra',
    system: { tuning: '12-tet', scale: 'major', harmony: 'calm-to-tense', root: 62 },
    ensemble: 'orchestra', bpm: 72, subdivision: 4,
  },
  {
    id: 'raw', label: 'Raw data (exact, no scale)',
    system: { tuning: '12-tet', scale: 'continuous', harmony: 'drone', root: 50 },
    ensemble: 'raw', bpm: 72, subdivision: 4,
  },
  {
    id: 'lullaby', label: 'Lullaby (slow, soft)',
    system: { tuning: 'just', scale: 'pentatonic', harmony: 'calm-to-tense', root: 57 },
    ensemble: 'lullaby', bpm: 52, subdivision: 2,
  },
  {
    id: 'evening-raga', label: 'Evening (raga Yaman-inspired, just tuning)',
    system: { tuning: 'just', scale: 'yaman-inspired', harmony: 'drone', root: 60 },
    ensemble: 'lullaby', bpm: 60, subdivision: 4,
  },
  {
    id: 'space', label: 'Space (whole-tone)',
    system: { tuning: '12-tet', scale: 'whole-tone', harmony: 'calm-to-tense', root: 60 },
    ensemble: 'orchestra', bpm: 64, subdivision: 4,
  },
]

export const recipeById = (id: string) => RECIPES.find((r) => r.id === id) ?? RECIPES[0]
