/**
 * Ensembles: how events sound. Each ensemble builds its instruments inside
 * whatever Tone context is current (live or offline), so the same code renders
 * the live jukebox and exported WAV files.
 *
 * Every timbre is synthesised: no third-party samples, so the audio can be
 * reused freely (CC0) by NASA, schools and museums.
 */
import * as Tone from 'tone'
import type { NoteEvent } from '../core/types'
import { Registry, Module } from '../core/registry'

export const midiToHz = (m: number, a4 = 440) => a4 * 2 ** ((m - 69) / 12)

export interface Voices {
  play(ev: NoteEvent, time: number, secPerBeat: number): void
  output: Tone.Gain
  dispose(): void
}

export interface Ensemble extends Module {
  description: string
  build(destination: Tone.InputNode): Voices
}

export const ensembles = new Registry<Ensemble>('ensemble')

type Poly = Tone.PolySynth<any>

function panned(dest: Tone.InputNode) {
  const p = new Tone.Panner(0).connect(dest as any)
  return p
}

function makeVoices(dest: Tone.InputNode, parts: Record<string, { node: Poly | Tone.MembraneSynth | Tone.NoiseSynth | Tone.Synth; pan?: Tone.Panner; gain?: number }>, extras: Tone.ToneAudioNode[]): Voices {
  const output = new Tone.Gain(1)
  output.connect(dest as any)
  const play = (ev: NoteEvent, time: number, spb: number) => {
    const key = ev.voice.startsWith('layer:') ? 'layer' : ev.voice
    const part = parts[key]
    if (!part) return
    const dur = Math.max(0.03, ev.dur * spb)
    const vel = Math.max(0, Math.min(1, ev.velocity * (part.gain ?? 1)))
    if (part.pan && ev.pan !== undefined) part.pan.pan.setValueAtTime(ev.pan * 0.8, time)
    const n = part.node as any
    if (Number.isNaN(ev.pitch)) {
      if (n instanceof Tone.NoiseSynth) n.triggerAttackRelease(dur, time, vel)
      else n.triggerAttackRelease(key === 'perc' ? 'C2' : 'C6', dur, time, vel)
    } else {
      n.triggerAttackRelease(midiToHz(ev.pitch), dur, time, vel)
    }
  }
  return {
    play, output,
    dispose() { Object.values(parts).forEach((p) => { p.node.dispose(); p.pan?.dispose() }); extras.forEach((e) => e.dispose()); output.dispose() },
  }
}

ensembles.add({
  id: 'orchestra',
  label: 'Orchestra',
  description: 'Strings hold the harmony, basses the ground, a celesta-like voice plays the melody across the map, brass swells with extremes, timpani mark flashes.',
  build(dest) {
    const bus = new Tone.Gain(1)
    const reverb = new Tone.Reverb({ decay: 3.5, wet: 0.32 })
    bus.chain(reverb)
    reverb.connect(dest as any)
    const out = (n: Tone.ToneAudioNode) => n.connect(bus)

    const padFilter = new Tone.Filter(1800, 'lowpass'); out(padFilter)
    const pad = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'fatsawtooth', count: 3, spread: 22 } as any, envelope: { attack: 0.6, decay: 0.4, sustain: 0.7, release: 1.6 }, volume: -20 }).connect(padFilter)
    const bassF = new Tone.Filter(600, 'lowpass'); out(bassF)
    const bass = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'triangle' }, envelope: { attack: 0.05, decay: 0.3, sustain: 0.6, release: 0.8 }, volume: -12 }).connect(bassF)
    const melPan = panned(bus)
    const melody = new Tone.PolySynth(Tone.FMSynth, { harmonicity: 3.01, modulationIndex: 6, envelope: { attack: 0.005, decay: 0.6, sustain: 0.1, release: 0.9 }, modulationEnvelope: { attack: 0.002, decay: 0.3, sustain: 0, release: 0.3 }, volume: -14 } as any).connect(melPan)
    const brassF = new Tone.Filter(1400, 'lowpass'); out(brassF)
    const brass = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'sawtooth' }, envelope: { attack: 0.35, decay: 0.2, sustain: 0.8, release: 0.9 }, volume: -22 }).connect(brassF)
    const percPan = panned(bus)
    const perc = new Tone.MembraneSynth({ pitchDecay: 0.08, octaves: 4, envelope: { attack: 0.001, decay: 0.6, sustain: 0, release: 0.4 }, volume: -8 }).connect(percPan)
    const ref = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'sine' }, envelope: { attack: 0.02, decay: 0.2, sustain: 0.3, release: 0.3 }, volume: -26 }); out(ref)
    const tickF = new Tone.Filter(5000, 'highpass'); out(tickF)
    const tick = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.03, sustain: 0 }, volume: -30 }).connect(tickF)
    const layer = new Tone.PolySynth(Tone.AMSynth, { envelope: { attack: 0.8, decay: 0.3, sustain: 0.6, release: 1.5 }, volume: -24 } as any); out(layer)
    return makeVoices(dest, {
      pad: { node: pad }, bass: { node: bass }, melody: { node: melody, pan: melPan }, brass: { node: brass },
      perc: { node: perc, pan: percPan }, ref: { node: ref }, tick: { node: tick }, layer: { node: layer },
    }, [bus, reverb, padFilter, bassF, brassF, tickF])
  },
})

ensembles.add({
  id: 'raw',
  label: 'Raw data',
  description: 'Plain sine tones with continuous pitch and no scale: the most exact way to hear the values. A low drone follows the average.',
  build(dest) {
    const bus = new Tone.Gain(1).connect(dest as any)
    const melPan = panned(bus)
    const melody = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'sine' }, envelope: { attack: 0.01, decay: 0.05, sustain: 0.9, release: 0.05 }, volume: -12 }).connect(melPan)
    const pad = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'sine' }, envelope: { attack: 0.3, decay: 0.1, sustain: 0.9, release: 0.5 }, volume: -18 }).connect(bus)
    const ref = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'triangle' }, envelope: { attack: 0.01, decay: 0.1, sustain: 0.2, release: 0.2 }, volume: -24 }).connect(bus)
    const tick = new Tone.NoiseSynth({ envelope: { attack: 0.001, decay: 0.02, sustain: 0 }, volume: -28 }).connect(bus)
    const percPan = panned(bus)
    const perc = new Tone.NoiseSynth({ envelope: { attack: 0.001, decay: 0.12, sustain: 0 }, volume: -10 }).connect(percPan)
    return makeVoices(dest, { melody: { node: melody, pan: melPan }, pad: { node: pad }, ref: { node: ref }, tick: { node: tick }, perc: { node: perc, pan: percPan } }, [bus])
  },
})

ensembles.add({
  id: 'lullaby',
  label: 'Lullaby',
  description: 'Soft bells, a breathing pad and gentle drops of water instead of drums. Slow and quiet, for falling asleep with the planet.',
  build(dest) {
    const bus = new Tone.Gain(0.9)
    const reverb = new Tone.Reverb({ decay: 6, wet: 0.5 })
    bus.chain(reverb); reverb.connect(dest as any)
    const padF = new Tone.Filter(900, 'lowpass').connect(bus)
    const pad = new Tone.PolySynth(Tone.AMSynth, { envelope: { attack: 2, decay: 0.5, sustain: 0.8, release: 3 }, volume: -20 } as any).connect(padF)
    const bass = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'sine' }, envelope: { attack: 0.5, decay: 0.3, sustain: 0.6, release: 2 }, volume: -16 }).connect(bus)
    const melPan = panned(bus)
    const melody = new Tone.PolySynth(Tone.FMSynth, { harmonicity: 2, modulationIndex: 2, envelope: { attack: 0.01, decay: 1.4, sustain: 0, release: 1.5 }, volume: -16 } as any).connect(melPan)
    const brass = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'triangle' }, envelope: { attack: 1.5, decay: 0.3, sustain: 0.6, release: 2 }, volume: -28 }).connect(padF)
    const percPan = panned(bus)
    const perc = new Tone.MembraneSynth({ pitchDecay: 0.02, octaves: 1.5, envelope: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.3 }, volume: -20 }).connect(percPan)
    const ref = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'sine' }, volume: -30 }).connect(bus)
    const layer = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'sine' }, envelope: { attack: 1.5, release: 2 }, volume: -28 }).connect(bus)
    return makeVoices(dest, {
      pad: { node: pad }, bass: { node: bass }, melody: { node: melody, pan: melPan, gain: 0.8 }, brass: { node: brass },
      perc: { node: perc, pan: percPan, gain: 0.6 }, ref: { node: ref }, layer: { node: layer },
    }, [bus, reverb, padF])
  },
})
