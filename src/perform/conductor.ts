/**
 * Performance layer. The data writes the score; the conductor only interprets it.
 *
 * Three signals, whatever the input (autopilot, keyboard, phone, camera):
 *   tempo     – speed multiplier (music and video together)
 *   dynamics  – loudness multiplier
 *   sections  – which sections play
 * plus an optional spotlight on a longitude.
 *
 * Every signal has an automatic value computed from the data (autopilot).
 * Human input is layered on top and fades back to the autopilot when idle.
 */
import { SECTIONS, type SectionId } from '../core/types'
import { clamp } from '../core/math'

export interface ConductorState {
  tempo: number
  dynamics: number
  sections: Record<SectionId, boolean>
  spotlight: number | null
}

export type ConductorInput = Partial<Omit<ConductorState, 'sections'>> & { sections?: Partial<Record<SectionId, boolean>> }

export class Conductor {
  private human: ConductorInput = {}
  private lastInput = -Infinity
  /** Seconds without input before control returns to the autopilot. */
  idleSeconds = 45
  listeners: ((s: ConductorState) => void)[] = []

  private sections: Record<SectionId, boolean> = Object.fromEntries(SECTIONS.map((s) => [s.id, true])) as Record<SectionId, boolean>

  input(change: ConductorInput, now = performance.now() / 1000) {
    if (change.sections) this.sections = { ...this.sections, ...change.sections } as Record<SectionId, boolean>
    const { sections: _s, ...rest } = change
    this.human = { ...this.human, ...rest }
    this.lastInput = now
    this.emit(now)
  }

  toggleSection(id: SectionId) { this.input({ sections: { [id]: !this.sections[id] } }) }

  nudge(key: 'tempo' | 'dynamics', delta: number) {
    const cur = this.state()[key]
    this.input({ [key]: clamp(cur + delta, key === 'tempo' ? 0.5 : 0, key === 'tempo' ? 2 : 1.5) })
  }

  /** Is a human currently conducting? */
  active(now = performance.now() / 1000) { return now - this.lastInput < this.idleSeconds }

  reset() { this.human = {}; this.lastInput = -Infinity; this.emit() }

  state(now = performance.now() / 1000): ConductorState {
    const auto: ConductorState = { tempo: 1, dynamics: 1, sections: this.sections, spotlight: null }
    if (!this.active(now)) {
      // Back on autopilot: forget human tempo/dynamics/spotlight, keep section choices.
      this.human = {}
      return auto
    }
    return {
      tempo: this.human.tempo ?? auto.tempo,
      dynamics: this.human.dynamics ?? auto.dynamics,
      sections: this.sections,
      spotlight: this.human.spotlight === undefined ? null : this.human.spotlight,
    }
  }

  private emit(now?: number) { const s = this.state(now); this.listeners.forEach((l) => l(s)) }
}

/** Which voices a section switch controls. */
export function voiceEnabled(voice: string, sections: Record<SectionId, boolean>): boolean {
  if (voice.startsWith('layer:')) return sections.strings
  for (const s of SECTIONS) if (s.voices.includes(voice)) return sections[s.id]
  return true
}
