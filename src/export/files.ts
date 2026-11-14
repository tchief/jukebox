/** Export: WAV (offline render with the same voices) and MIDI (the score itself). */
import * as Tone from 'tone'
import { Midi } from '@tonejs/midi'
import type { NoteEvent } from '../core/types'
import { ensembles } from '../voices/ensembles'

export async function renderWav(events: NoteEvent[], bpm: number, ensembleId: string, seconds: number): Promise<Blob> {
  const spb = 60 / bpm
  const buffer = await Tone.Offline(async () => {
    const master = new Tone.Limiter(-1).toDestination()
    const voices = ensembles.get(ensembleId).build(master)
    await Tone.loaded()
    for (const ev of events) if (ev.voice !== 'tick' && ev.voice !== 'ref') voices.play(ev, ev.time * spb + 0.05, spb)
  }, seconds + 4, 2, 44100)
  return new Blob([wavBytes(buffer.get() as AudioBuffer)], { type: 'audio/wav' })
}

function wavBytes(buf: AudioBuffer): ArrayBuffer {
  const ch = buf.numberOfChannels, len = buf.length, rate = buf.sampleRate
  const out = new ArrayBuffer(44 + len * ch * 2)
  const v = new DataView(out)
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  str(0, 'RIFF'); v.setUint32(4, 36 + len * ch * 2, true); str(8, 'WAVE'); str(12, 'fmt ')
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true); v.setUint32(24, rate, true)
  v.setUint32(28, rate * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true)
  str(36, 'data'); v.setUint32(40, len * ch * 2, true)
  const data = Array.from({ length: ch }, (_, c) => buf.getChannelData(c))
  let o = 44
  for (let i = 0; i < len; i++) for (let c = 0; c < ch; c++) {
    const s = Math.max(-1, Math.min(1, data[c][i]))
    v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2
  }
  return out
}

const GM: Record<string, number> = { pad: 48, bass: 32, melody: 8, brass: 61, perc: 47, layer: 52 }

/**
 * MIDI for composers and notation software. Micro-tones are rounded to the
 * nearest semitone and the remainder is written as pitch bend.
 */
export function scoreToMidi(events: NoteEvent[], bpm: number, title: string): Uint8Array {
  const midi = new Midi()
  midi.header.setTempo(bpm)
  midi.header.name = title
  const spb = 60 / bpm
  const tracks = new Map<string, ReturnType<Midi['addTrack']>>()
  let channel = 0
  for (const ev of events) {
    if (ev.voice === 'tick' || ev.voice === 'ref') continue
    const key = ev.voice.startsWith('layer:') ? ev.voice : ev.voice
    let tr = tracks.get(key)
    if (!tr) {
      tr = midi.addTrack()
      tr.name = key
      tr.channel = key === 'perc' ? 9 : channel++ % 9
      tr.instrument.number = GM[key.split(':')[0]] ?? 0
      tracks.set(key, tr)
    }
    if (Number.isNaN(ev.pitch)) {
      tr.addNote({ midi: 47, time: ev.time * spb, duration: ev.dur * spb, velocity: ev.velocity })
      continue
    }
    const n = Math.round(ev.pitch), bend = ev.pitch - n
    if (Math.abs(bend) > 0.01) tr.addPitchBend({ time: ev.time * spb, value: bend / 2 })
    tr.addNote({ midi: n, time: ev.time * spb, duration: ev.dur * spb, velocity: ev.velocity })
    if (Math.abs(bend) > 0.01) tr.addPitchBend({ time: (ev.time + ev.dur) * spb, value: 0 })
  }
  return midi.toArray()
}

export function download(blob: Blob, name: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}
