/**
 * EarthOrchestraEngine – the reusable heart shared by the app, the embeddable
 * <earth-orchestra> element and the kiosk mode.
 *
 *   load(entry) → analyse frames (one sample per half second) → play live
 *
 * Live playback renders each beat just in time from the pre-analysed features,
 * so the conductor (tempo, dynamics, sections, spotlight) can change things
 * while the data still writes every note.
 */
import * as Tone from 'tone'
import type { FrameFeatures, NoteEvent, Recipe } from './core/types'
import { BEATS_PER_BAR, buildScore, eventsForBeat } from './core/score'
import { recipeById } from './core/recipes'
import { timelineStats, translations, type TimelineStats } from './translate/translations'
import { analyzeFrame, DEFAULT_ANALYZE, type AnalyzerState } from './analysis/analyze'
import { hueScale, luminanceScale, lutScale, stopsFromColorbar, THERMAL_STOPS, type ColorScale } from './analysis/colorscale'
import { CATALOG, type CatalogEntry } from './sources/catalog'
import { fileSource, svsSource, syntheticSource, type VisualSource } from './sources/sources'
import { ensembles, type Voices } from './voices/ensembles'
import { Conductor, voiceEnabled } from './perform/conductor'
import { evaluate, type Evaluation } from './export/evaluate'
import { renderWav, scoreToMidi } from './export/files'

export const ANALYSIS_W = 160, ANALYSIS_H = 80
/** Feature samples per second of source time. */
const SAMPLE_RATE = 2

export interface BeatInfo { beat: number; bar: number; bars: number; features: FrameFeatures; events: NoteEvent[]; spotlight: number | null }

export interface EngineOptions { base?: string; loop?: boolean }

export class EarthOrchestraEngine {
  entry: CatalogEntry = CATALOG[0]
  source?: VisualSource
  scale: ColorScale = luminanceScale()
  samples: FrameFeatures[] = []
  recipe: Recipe = recipeById('orchestra')
  conductor = new Conductor()
  playing = false
  onBeat: ((b: BeatInfo) => void)[] = []
  onStatus: ((s: string) => void)[] = []

  private voices?: Voices
  private master?: Tone.Gain
  private repeatId?: number
  private beat = 0
  private stats?: TimelineStats
  private canvas = document.createElement('canvas')
  private ctx: CanvasRenderingContext2D

  constructor(private opts: EngineOptions = {}) {
    this.canvas.width = ANALYSIS_W; this.canvas.height = ANALYSIS_H
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!
    this.conductor.listeners.push((s) => this.applyConductor(s.tempo, s.dynamics))
  }

  get translation() { return translations.get(this.recipe.translation || this.entry.translation) }
  get totalBeats() { return Math.max(BEATS_PER_BAR, Math.floor((this.duration * this.recipe.bpm) / 60 / BEATS_PER_BAR) * BEATS_PER_BAR) }
  get duration() { return this.source?.duration ?? 30 }
  /** One feature sample per beat of the current recipe. */
  get beats(): FrameFeatures[] {
    const out: FrameFeatures[] = []
    for (let b = 0; b < this.totalBeats; b++) {
      const t = (b * 60) / this.recipe.bpm
      out.push(this.samples[Math.min(this.samples.length - 1, Math.round(t * SAMPLE_RATE))])
    }
    return out
  }

  private status(s: string) { this.onStatus.forEach((f) => f(s)) }

  async load(entry: CatalogEntry | File, progress?: (p: number) => void) {
    this.stop()
    if (entry instanceof File) {
      this.entry = { id: 'file', title: entry.name, translation: 'sequential@1', scale: 'hue', layers: true, recipe: this.recipe.id, description: 'Your own image or video.' }
      this.source = await fileSource(entry)
    } else {
      this.entry = entry
      this.status(`Loading ${entry.title}…`)
      this.source = entry.svs ? await svsSource(entry, this.opts.base ?? '') : syntheticSource()
    }
    this.scale = await this.makeScale()
    this.status('Listening to the frames…')
    await this.analyse(progress)
    this.status('Ready')
  }

  private async makeScale(): Promise<ColorScale> {
    const hint = this.entry.scale
    if (hint === 'luminance') return luminanceScale()
    if (hint === 'thermal') return lutScale('thermal', 'Thermal (blue → red)', THERMAL_STOPS)
    if (hint === 'colorbar' && this.source?.colorbarUrl) {
      try {
        const img = new Image(); img.crossOrigin = 'anonymous'; img.src = this.source.colorbarUrl
        await img.decode()
        const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight
        const x = c.getContext('2d', { willReadFrequently: true })!
        x.drawImage(img, 0, 0)
        return lutScale(`colorbar-${this.entry.svs}`, 'Colour bar of this visualisation', stopsFromColorbar(x.getImageData(0, 0, c.width, c.height)))
      } catch { /* fall back to the rainbow scale */ }
    }
    return hueScale()
  }

  /** Grab the current frame of the source as pixels. */
  grab(): ImageData {
    const el = this.source!.element
    this.ctx.drawImage(el as CanvasImageSource, 0, 0, ANALYSIS_W, ANALYSIS_H)
    return this.ctx.getImageData(0, 0, ANALYSIS_W, ANALYSIS_H)
  }

  async analyse(progress?: (p: number) => void) {
    const src = this.source!
    const n = src.isVideo || src.element instanceof HTMLCanvasElement ? Math.max(1, Math.floor(src.duration * SAMPLE_RATE)) : 1
    const state: AnalyzerState = {}
    const samples: FrameFeatures[] = []
    for (let i = 0; i < n; i++) {
      const t = i / SAMPLE_RATE
      await src.seek(t)
      samples.push(analyzeFrame(this.grab(), this.scale, t, state, { ...DEFAULT_ANALYZE, layers: !!this.entry.layers }))
      progress?.((i + 1) / n)
    }
    await src.seek(0)
    this.samples = samples
    this.stats = timelineStats(this.beats)
  }

  setRecipe(r: Recipe) {
    const was = this.playing
    if (was) this.pause()
    this.voices?.dispose(); this.voices = undefined
    this.recipe = r
    if (this.samples.length) this.stats = timelineStats(this.beats)
    if (was) void this.play()
  }

  async play() {
    if (!this.samples.length) return
    await Tone.start()
    if (!this.master) this.master = new Tone.Gain(1).connect(new Tone.Limiter(-1).toDestination())
    if (!this.voices) { this.voices = ensembles.get(this.recipe.ensemble).build(this.master); await Tone.loaded() }
    const tr = Tone.getTransport()
    this.applyConductor(this.conductor.state().tempo, this.conductor.state().dynamics)
    if (this.repeatId === undefined) this.repeatId = tr.scheduleRepeat((time) => this.tick(time), '4n')
    tr.start()
    this.playing = true
    if (this.source?.element instanceof HTMLVideoElement) void this.source.element.play().catch(() => {})
  }

  pause() {
    Tone.getTransport().pause()
    this.playing = false
    if (this.source?.element instanceof HTMLVideoElement) this.source.element.pause()
  }

  stop() {
    const tr = Tone.getTransport()
    tr.stop()
    if (this.repeatId !== undefined) { tr.clear(this.repeatId); this.repeatId = undefined }
    this.playing = false
    this.beat = 0
    if (this.source?.element instanceof HTMLVideoElement) this.source.element.pause()
  }

  /** Jump to a bar (keyboard navigation). */
  seekBar(bar: number) {
    const bars = this.totalBeats / BEATS_PER_BAR
    this.beat = (((Math.round(bar) % bars) + bars) % bars) * BEATS_PER_BAR
  }

  private applyConductor(tempo: number, dynamics: number) {
    Tone.getTransport().bpm.value = this.recipe.bpm * tempo
    this.master?.gain.rampTo(dynamics, 0.2)
    if (this.source?.element instanceof HTMLVideoElement) this.source.element.playbackRate = tempo
  }

  private tick(time: number) {
    if (!this.stats || !this.voices) return
    if (this.beat >= this.totalBeats) {
      if (this.opts.loop === false) { Tone.getDraw().schedule(() => this.stop(), time); return }
      this.beat = 0
    }
    const b = this.beat++
    const cs = this.conductor.state()
    const spb = 60 / Tone.getTransport().bpm.value
    const input = { beats: this.beats, recipe: this.recipe, translation: this.entry.translation }
    const events = eventsForBeat(input, b, this.stats, cs.spotlight)
    for (const ev of events) {
      if (!voiceEnabled(ev.voice, cs.sections)) continue
      this.voices.play(ev, time + (ev.time - b) * spb, spb)
    }
    const features = input.beats[b]
    Tone.getDraw().schedule(() => {
      this.syncVisual(b)
      const info: BeatInfo = { beat: b, bar: Math.floor(b / BEATS_PER_BAR), bars: this.totalBeats / BEATS_PER_BAR, features, events, spotlight: cs.spotlight }
      this.onBeat.forEach((f) => f(info))
    }, time)
  }

  private syncVisual(b: number) {
    const src = this.source
    if (!src) return
    const expected = (b * 60) / this.recipe.bpm
    if (src.element instanceof HTMLVideoElement) {
      const v = src.element
      if (Math.abs(v.currentTime - expected) > 0.35) v.currentTime = Math.min(expected, v.duration - 0.05)
      if (v.paused && this.playing) void v.play().catch(() => {})
    } else if (src.element instanceof HTMLCanvasElement) {
      void src.seek(expected)
    }
  }

  score(): NoteEvent[] { return buildScore({ beats: this.beats, recipe: this.recipe, translation: this.entry.translation }) }
  evaluation(): Evaluation { return evaluate(this.beats, this.recipe, this.entry.translation) }
  async wav(): Promise<Blob> { return renderWav(this.score(), this.recipe.bpm, this.recipe.ensemble, (this.totalBeats * 60) / this.recipe.bpm) }
  midi(): Blob { return new Blob([scoreToMidi(this.score(), this.recipe.bpm, this.entry.title) as BlobPart], { type: 'audio/midi' }) }

  /** A short spoken-style description of what is heard now (for screen readers). */
  describe(info?: BeatInfo): string {
    const f = info?.features ?? this.beats[0]
    if (!f || !this.stats) return 'Nothing loaded yet.'
    const pct = (x: number) => `${Math.round(x * 100)}%`
    const mid = (this.stats.minMean + this.stats.maxMean) / 2
    const level = f.mean > mid + 0.02 ? 'above' : f.mean < mid - 0.02 ? 'below' : 'near'
    const parts = [
      info ? `Bar ${info.bar + 1} of ${info.bars}.` : '',
      `Average ${pct(f.mean)} of the colour scale, ${level} the middle of this clip, so the harmony is ${level === 'above' ? 'higher' : level === 'below' ? 'lower' : 'in the middle'}.`,
      f.hot > 0.02 ? `Extremes cover ${pct(f.hot)} of the map; brass marks them.` : 'Few extremes.',
      f.flash > 0.05 ? 'Flashes are sounding as drums.' : '',
      info?.spotlight != null ? `Spotlight at ${Math.round(info.spotlight * 360 - 180)}° longitude.` : '',
    ]
    return parts.filter(Boolean).join(' ')
  }
}
