/**
 * Colour scales turn a pixel colour back into a data value 0..1.
 *
 * A SVS visualisation encodes a physical quantity with a colour bar. If we know
 * the colour bar we can invert it ("which value does this colour mean?") and the
 * music is driven by the data, not by arbitrary pixel brightness.
 */
import { Module } from '../core/registry'

export interface Decoded { t: number; valid: boolean }

export interface ColorScale extends Module {
  decode(r: number, g: number, b: number): Decoded
}

type RGB = [number, number, number]

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  let h = 0
  if (d) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return [h, max ? d / max : 0, max]
}

export const luminance = (r: number, g: number, b: number) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255

/** Brightness as data: night lights, lightning, fires. Every pixel is valid. */
export function luminanceScale(gamma = 1): ColorScale {
  return {
    id: `luminance${gamma === 1 ? '' : '-' + gamma}`,
    label: 'Brightness',
    decode: (r, g, b) => ({ t: Math.pow(luminance(r, g, b), gamma), valid: true }),
  }
}

/**
 * Generic "rainbow" scale for colour bars we could not read: blue (cold/low)
 * → cyan → green → yellow → red (hot/high). Grey, black and white pixels
 * (land, background, labels) are ignored.
 */
export function hueScale(minSaturation = 0.25, minValue = 0.15): ColorScale {
  return {
    id: 'hue-rainbow',
    label: 'Rainbow colour scale (blue = low, red = high)',
    decode(r, g, b) {
      const [h, s, v] = rgbToHsv(r, g, b)
      if (s < minSaturation || v < minValue) return { t: 0, valid: false }
      // 240° (blue) → 0, 0° (red) → 1. Purples/magentas (240°–360°) treated as the extremes.
      let t: number
      if (h <= 240) t = 1 - h / 240
      else t = h < 300 ? 0 : 1
      return { t, valid: true }
    },
  }
}

/** Scale built from colour stops sampled along a colour bar, low → high. */
export function lutScale(id: string, label: string, stops: RGB[], maxDistance = 60): ColorScale {
  if (stops.length < 2) throw new Error('A colour bar needs at least two colours')
  const n = stops.length
  // Small cache: frames reuse the same colours constantly.
  const cache = new Map<number, Decoded>()
  return {
    id, label,
    decode(r, g, b) {
      const key = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2)
      const hit = cache.get(key)
      if (hit) return hit
      let best = Infinity, bi = 0
      for (let i = 0; i < n; i++) {
        const s = stops[i]
        const d = (s[0] - r) ** 2 + (s[1] - g) ** 2 + (s[2] - b) ** 2
        if (d < best) { best = d; bi = i }
      }
      const res = { t: bi / (n - 1), valid: Math.sqrt(best) <= maxDistance }
      if (cache.size < 65536) cache.set(key, res)
      return res
    },
  }
}

/**
 * Read colour stops from a colour bar image (horizontal or vertical).
 * Samples the middle line along the long side and drops repeated colours.
 * `reverse` flips it for vertical bars drawn high-at-top.
 */
export function stopsFromColorbar(img: { width: number; height: number; data: Uint8ClampedArray }, samples = 64): RGB[] {
  const horizontal = img.width >= img.height
  const len = horizontal ? img.width : img.height
  const across = horizontal ? img.height : img.width
  const stops: RGB[] = []
  // Skip borders (frames, tick marks) at both ends.
  const start = Math.floor(len * 0.03), end = Math.ceil(len * 0.97)
  for (let i = 0; i < samples; i++) {
    const p = Math.round(start + ((end - start - 1) * i) / (samples - 1))
    // Median of a short line across the bar, which ignores tick marks.
    const col: RGB[] = []
    for (let a = Math.floor(across * 0.3); a <= Math.floor(across * 0.7); a++) {
      const x = horizontal ? p : a, y = horizontal ? a : p
      const o = (y * img.width + x) * 4
      col.push([img.data[o], img.data[o + 1], img.data[o + 2]])
    }
    col.sort((u, v) => u[0] + u[1] + u[2] - (v[0] + v[1] + v[2]))
    stops.push(col[Math.floor(col.length / 2)])
  }
  // Vertical colour bars are usually drawn with the highest value on top.
  if (!horizontal) stops.reverse()
  return stops
}

/** A thermal palette (deep blue → white → deep red) used by the synthetic demo. */
export const THERMAL_STOPS: RGB[] = [
  [8, 29, 88], [37, 52, 148], [34, 94, 168], [29, 145, 192], [65, 182, 196],
  [127, 205, 187], [199, 233, 180], [255, 255, 204], [254, 217, 118], [254, 178, 76],
  [253, 141, 60], [252, 78, 42], [227, 26, 28], [177, 0, 38], [128, 0, 38],
]

export function hueFamily(r: number, g: number, b: number, minSaturation = 0.3, minValue = 0.2): number {
  const [h, s, v] = rgbToHsv(r, g, b)
  if (s < minSaturation || v < minValue) return -1
  return Math.floor(((h + 30) % 360) / 60) // 0 red, 1 yellow, 2 green, 3 cyan, 4 blue, 5 magenta
}

export const HUE_FAMILY_NAMES = ['red', 'yellow', 'green', 'cyan', 'blue', 'magenta']
