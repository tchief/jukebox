/**
 * Visual sources. A source can draw its frame at time t into a canvas.
 * - SVS (via our /svs proxy, which avoids CORS and keeps NASA files intact)
 * - a local file the user picks (any EIC frame or video)
 * - a synthetic ocean for offline tests
 */
import { SVS_CREDIT, type CatalogEntry } from './catalog'
import { THERMAL_STOPS } from '../analysis/colorscale'

export interface VisualSource {
  title: string
  credit: string
  pageUrl?: string
  duration: number
  /** Element shown to the viewer. */
  element: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement
  /** Prepare frame at time t (seek, render) so `element` shows it. */
  seek(t: number): Promise<void>
  /** URL of a colour bar image, if the visualisation has one. */
  colorbarUrl?: string
  isVideo: boolean
}

// ───────────────────────── SVS API discovery ─────────────────────────

interface MediaItem { url: string; filename: string; width: number; height: number; kind: 'video' | 'image' | 'other' }

/** Collect every object with a `url` from SVS API JSON, whatever its nesting. */
export function collectMedia(json: unknown): MediaItem[] {
  const out: MediaItem[] = []
  const seen = new Set<string>()
  const walk = (o: unknown) => {
    if (!o || typeof o !== 'object') return
    if (Array.isArray(o)) { o.forEach(walk); return }
    const r = o as Record<string, unknown>
    if (typeof r.url === 'string' && !seen.has(r.url)) {
      const url = r.url
      const filename = String(r.filename ?? url.split('/').pop() ?? '')
      const ext = filename.split('.').pop()?.toLowerCase() ?? ''
      const kind = ['mp4', 'webm', 'mov', 'm4v'].includes(ext) ? 'video' : ['png', 'jpg', 'jpeg', 'tif', 'tiff', 'webp'].includes(ext) ? 'image' : 'other'
      seen.add(url)
      out.push({ url, filename, width: Number(r.width) || 0, height: Number(r.height) || 0, kind })
    }
    Object.values(r).forEach(walk)
  }
  walk(json)
  return out
}

const BAD = /(thumb|print|searchweb|_web\.|preview|title|text|label|annotated|caption|credit|slate|logo)/i

/** Choose a light video (≈1280 px wide) and the colour bar. */
export function chooseMedia(items: MediaItem[]) {
  const colorbar = items.find((m) => m.kind === 'image' && /colou?r[_-]?bar|legend|scale/i.test(m.filename))
  const videos = items.filter((m) => m.kind === 'video' && !/colou?r[_-]?bar/i.test(m.filename))
  const score = (m: MediaItem) => (BAD.test(m.filename) ? 5000 : 0) + Math.abs((m.width || 1920) - 1280) + (/\.mp4$/i.test(m.filename) ? 0 : 300)
  videos.sort((a, b) => score(a) - score(b))
  const images = items.filter((m) => m.kind === 'image' && m !== colorbar && (m.width >= 640 || !m.width))
  images.sort((a, b) => score(a) - score(b))
  return { video: videos[0], image: images[0], colorbar }
}

/** Rewrite an svs.gsfc.nasa.gov URL to our same-origin proxy. */
export function proxied(url: string, base = ''): string {
  const m = url.match(/^https?:\/\/svs\.gsfc\.nasa\.gov\/(.*)$/i)
  return m ? `${base}/svs/${m[1]}` : url
}

export async function svsSource(entry: CatalogEntry, base = ''): Promise<VisualSource> {
  const res = await fetch(`${base}/svs/api/${entry.svs}`)
  if (!res.ok) throw new Error(`SVS ${entry.svs}: HTTP ${res.status}`)
  if (!(res.headers.get('content-type') ?? '').includes('json')) throw new Error('the NASA SVS connection is not available on this server (the /svs proxy runs on Cloudflare Pages)')
  const json = await res.json()
  const { video, image, colorbar } = chooseMedia(collectMedia(json))
  const pageUrl = `https://svs.gsfc.nasa.gov/${entry.svs}/`
  const common = { title: entry.title, credit: SVS_CREDIT, pageUrl, colorbarUrl: colorbar ? proxied(colorbar.url, base) : undefined }
  if (video) return { ...common, ...(await videoSource(proxied(video.url, base))) }
  if (image) return { ...common, ...(await imageSource(proxied(image.url, base))) }
  throw new Error(`No playable video or image found for SVS ${entry.svs}`)
}

// ───────────────────────── Video / image / file ─────────────────────────

export async function videoSource(url: string): Promise<Omit<VisualSource, 'title' | 'credit'>> {
  const v = document.createElement('video')
  v.crossOrigin = 'anonymous'
  v.muted = true // NASA's own soundtrack (if any) is never used.
  v.playsInline = true
  v.preload = 'auto'
  v.src = url
  await new Promise<void>((ok, fail) => {
    v.addEventListener('loadedmetadata', () => ok(), { once: true })
    v.addEventListener('error', () => fail(new Error(`Video failed to load: ${url}`)), { once: true })
  })
  return {
    duration: v.duration || 30,
    element: v,
    isVideo: true,
    seek: (t) => new Promise<void>((ok) => {
      const target = Math.min(Math.max(0, t), Math.max(0, v.duration - 0.05))
      if (Math.abs(v.currentTime - target) < 0.01 && v.readyState >= 2) return ok()
      const done = () => ok()
      v.addEventListener('seeked', done, { once: true })
      v.currentTime = target
      setTimeout(done, 3000)
    }),
  }
}

export async function imageSource(url: string, seconds = 40): Promise<Omit<VisualSource, 'title' | 'credit'>> {
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.src = url
  await img.decode()
  return { duration: seconds, element: img, isVideo: false, seek: async () => {} }
}

export async function fileSource(file: File): Promise<VisualSource> {
  const url = URL.createObjectURL(file)
  const base = file.type.startsWith('video') ? await videoSource(url) : await imageSource(url)
  return { ...base, title: file.name, credit: 'Your file' }
}

// ───────────────────────── Synthetic ocean ─────────────────────────

/** Deterministic pseudo-random. */
function hash(n: number) { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x) }

export function drawSyntheticOcean(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  const img = ctx.createImageData(w, h)
  const warming = t / 40 // slow warming trend over the clip
  for (let y = 0; y < h; y++) {
    const lat = (y / h) * 2 - 1 // -1 north pole … +1 south pole
    for (let x = 0; x < w; x++) {
      const lon = x / w
      // A continent: a grey band in the middle-west (land is ignored by the analyser).
      const land = Math.abs(lon - 0.33) < 0.05 && Math.abs(lat) < 0.6
      const o = (y * w + x) * 4
      if (land) { img.data[o] = img.data[o + 1] = img.data[o + 2] = 90; img.data[o + 3] = 255; continue }
      let v = 1 - Math.abs(lat) * 1.1 // warm equator
      v += 0.12 * Math.sin(lon * 12 + t * 0.6 + lat * 3) // drifting eddies
      v += 0.25 * Math.exp(-(((lon - ((0.7 + t * 0.01) % 1)) * 6) ** 2 + ((lat + 0.15) * 5) ** 2)) // a warm pool moving east
      v += warming * 0.25 - 0.08
      const k = Math.max(0, Math.min(THERMAL_STOPS.length - 1, Math.round(v * (THERMAL_STOPS.length - 1))))
      const c = THERMAL_STOPS[k]
      img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255
    }
  }
  // Lightning flashes over the tropics, in a deterministic rhythm.
  const step = Math.floor(t * 2)
  if (hash(step) > 0.55) {
    const fx = Math.floor(hash(step + 7) * w), fy = Math.floor(h * (0.4 + hash(step + 3) * 0.2))
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const x = fx + dx, y = fy + dy
      if (x < 0 || y < 0 || x >= w || y >= h) continue
      const o = (y * w + x) * 4
      img.data[o] = img.data[o + 1] = img.data[o + 2] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
}

export function syntheticSource(): VisualSource {
  const c = document.createElement('canvas')
  c.width = 640; c.height = 320
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  drawSyntheticOcean(ctx, c.width, c.height, 0)
  return {
    title: 'Demo: synthetic ocean', credit: 'Generated in the browser (not NASA data)',
    duration: 40, element: c, isVideo: false,
    seek: async (t) => drawSyntheticOcean(ctx, c.width, c.height, t),
  }
}
