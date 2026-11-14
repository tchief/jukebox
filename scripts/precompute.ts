/**
 * Precompute frame features for the catalogue (run with: npx tsx scripts/precompute.ts [svs…]).
 *
 * NASA's files are large (20 MB – 1 GB), so instead of every visitor analysing
 * them in the browser we analyse once, with exactly the same analyser code,
 * and publish a small JSON per visualisation: public/features/<svs>.json.
 * The same script is the "SVS number → sonification features" pipeline that
 * the EIC could run on new daily visualisations.
 */
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { analyzeFrame, DEFAULT_ANALYZE, type AnalyzerState } from '../src/analysis/analyze'
import { hueScale, luminanceScale, lutScale, type ColorScale } from '../src/analysis/colorscale'
import { SVS_CONFIG, type SvsConfig } from './svs-config'
import type { FrameFeatures } from '../src/core/types'

const W = 160, H = 80, FPS = 2
/** ffmpeg reads http_proxy (also for https) – pass the session proxy if there is one. */
const PROXY_ENV = { ...process.env, ...(process.env.HTTPS_PROXY ? { http_proxy: process.env.HTTPS_PROXY } : {}) }
const ORIGIN = 'https://svs.gsfc.nasa.gov/'

function ffmpeg(args: string[]): Promise<Buffer> {
  return new Promise((ok, fail) => {
    const p = spawn('ffmpeg', ['-loglevel', 'error', ...args], { stdio: ['ignore', 'pipe', 'pipe'], env: PROXY_ENV })
    const out: Buffer[] = [], err: Buffer[] = []
    p.stdout.on('data', (d) => out.push(d)); p.stderr.on('data', (d) => err.push(d))
    p.on('close', (code) => (code === 0 ? ok(Buffer.concat(out)) : fail(new Error(Buffer.concat(err).toString().slice(0, 500)))))
  })
}

async function mediaUrls(svs: number): Promise<Map<string, string>> {
  const json = await (await fetch(`${ORIGIN}api/${svs}`)).json() as { media_groups: unknown[] }
  const map = new Map<string, string>()
  const walk = (o: unknown) => {
    if (!o || typeof o !== 'object') return
    if (Array.isArray(o)) return o.forEach(walk)
    const r = o as Record<string, unknown>
    if (typeof r.url === 'string' && /\.\w{3,4}$/.test(r.url)) map.set(r.url.split('/').pop()!, r.url.replace(/^http:/, 'https:'))
    Object.values(r).forEach(walk)
  }
  walk(json.media_groups) // only this page's own media, not "related" pages
  return map
}

async function colorbarStops(url: string, bar: { y: number; x0: number; x1: number }): Promise<[number, number, number][]> {
  const probe = await ffmpeg(['-i', url, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])
  const meta = await new Promise<string>((ok) => {
    const p = spawn('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', url], { env: PROXY_ENV })
    let s = ''; p.stdout.on('data', (d) => (s += d)); p.on('close', () => ok(s.trim()))
  })
  const [w] = meta.split(',').map(Number)
  const stops: [number, number, number][] = []
  const n = 64
  for (let i = 0; i < n; i++) {
    const x = Math.round(bar.x0 + ((bar.x1 - bar.x0) * i) / (n - 1))
    // Median over a few rows to skip tick marks.
    const px: [number, number, number][] = []
    for (let dy = -2; dy <= 2; dy++) {
      const o = ((bar.y + dy) * w + x) * 3
      px.push([probe[o], probe[o + 1], probe[o + 2]])
    }
    px.sort((a, b) => a[0] + a[1] + a[2] - (b[0] + b[1] + b[2]))
    stops.push(px[2])
  }
  return stops
}

const round = (x: number) => Math.round(x * 1000) / 1000

async function run(cfg: SvsConfig) {
  const urls = await mediaUrls(cfg.svs)
  const media = urls.get(cfg.media)
  if (!media) throw new Error(`${cfg.svs}: ${cfg.media} not in API`)
  let scale: ColorScale
  let scaleOut: Record<string, unknown>
  if (cfg.scale.kind === 'colorbar') {
    const bar = cfg.scale.bar
    const cbUrl = urls.get(bar.file)
    if (!cbUrl) throw new Error(`${cfg.svs}: colour bar ${bar.file} not in API`)
    const stops = await colorbarStops(cbUrl, bar)
    scale = lutScale(`colorbar-${cfg.svs}`, bar.label, stops)
    scaleOut = { kind: 'colorbar', label: `${bar.label} (${bar.min}–${bar.max} ${bar.units})`, stops, min: bar.min, max: bar.max, units: bar.units, colorbarUrl: cbUrl }
  } else if (cfg.scale.kind === 'luminance') {
    scale = luminanceScale(); scaleOut = { kind: 'luminance', label: cfg.scale.label }
  } else {
    scale = hueScale(); scaleOut = { kind: 'hue', label: cfg.scale.label }
  }

  const isImage = /\.(png|jpe?g)$/i.test(cfg.media)
  const raw = await ffmpeg([
    ...(isImage ? [] : ['-t', String(cfg.maxSeconds)]),
    '-i', media,
    '-vf', `${isImage ? '' : `fps=${FPS},`}scale=${W}:${H}:flags=area`,
    '-f', 'rawvideo', '-pix_fmt', 'rgba', '-',
  ])
  const frameBytes = W * H * 4
  const frames = Math.floor(raw.length / frameBytes)
  const state: AnalyzerState = {}
  const opts = { ...DEFAULT_ANALYZE, layers: !!cfg.categories, categories: cfg.categories?.map((c) => c.rgb) }
  const samples: FrameFeatures[] = []
  for (let i = 0; i < frames; i++) {
    const data = new Uint8ClampedArray(raw.buffer, raw.byteOffset + i * frameBytes, frameBytes)
    const f = analyzeFrame({ width: W, height: H, data }, scale, i / FPS, state, opts)
    if (!cfg.flashes) { f.flash = 0; f.flashColumns = f.flashColumns.map(() => 0) }
    samples.push({
      ...f, mean: round(f.mean), spread: round(f.spread), hot: round(f.hot), coverage: round(f.coverage),
      change: round(f.change), flash: round(f.flash), time: round(f.time),
      columns: f.columns.map(round), rows: f.rows.map(round), flashColumns: f.flashColumns.map(round), layers: f.layers.map(round),
    })
  }
  const duration = isImage ? cfg.maxSeconds : frames / FPS
  // A light H.264 copy of the clip for display: plays in every browser, loads fast, works offline in a kiosk.
  mkdirSync('public/media', { recursive: true })
  const local = `/media/${cfg.svs}.${isImage ? 'jpg' : 'mp4'}`
  if (isImage) await ffmpeg(['-y', '-i', media, '-vf', 'scale=2048:-2', '-q:v', '3', `public${local}`])
  else await ffmpeg(['-y', '-t', String(duration), '-i', media, '-an', '-vf', 'scale=1024:-2,fps=30', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '31', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', `public${local}`])
  const out = {
    svs: cfg.svs, page: `https://svs.gsfc.nasa.gov/${cfg.svs}/`, media: local, original: media, kind: isImage ? 'image' : 'video',
    duration, sampleRate: FPS, scale: scaleOut,
    layers: cfg.categories?.map((c) => c.name),
    generated: new Date().toISOString(),
    samples: isImage ? [samples[0]] : samples,
  }
  writeFileSync(`public/features/${cfg.svs}.json`, JSON.stringify(out))
  const m = samples.map((s) => s.mean)
  console.log(`${cfg.svs}: ${frames} frames, ${duration}s, mean ${Math.min(...m).toFixed(2)}–${Math.max(...m).toFixed(2)}, coverage ${samples[0].coverage}, flashes ${samples.filter((s) => s.flash > 0.05).length}`)
}

mkdirSync('public/features', { recursive: true })
const only = process.argv.slice(2).map(Number)
for (const cfg of SVS_CONFIG.filter((c) => !only.length || only.includes(c.svs))) {
  try { await run(cfg) } catch (e) { console.error(`${cfg.svs} FAILED: ${(e as Error).message}`) }
}
