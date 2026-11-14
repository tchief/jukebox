export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : Number.isFinite(x) ? x : 0)
export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

/** Pearson correlation; 0 if undefined. */
export function correlation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length)
  if (n < 2) return 0
  const ma = mean(a.slice(0, n)), mb = mean(b.slice(0, n))
  let num = 0, da = 0, db = 0
  for (let i = 0; i < n; i++) {
    const x = a[i] - ma, y = b[i] - mb
    num += x * y; da += x * x; db += y * y
  }
  return da && db ? num / Math.sqrt(da * db) : 0
}

/** Resample an array to `n` values by averaging buckets (or linear interpolation when upsampling). */
export function resample(xs: number[], n: number): number[] {
  if (!xs.length) return new Array(n).fill(0)
  const out: number[] = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * xs.length, b = ((i + 1) / n) * xs.length
    const lo = Math.floor(a), hi = Math.max(lo + 1, Math.ceil(b))
    let s = 0, c = 0
    for (let j = lo; j < hi && j < xs.length; j++) { s += xs[j]; c++ }
    out.push(c ? s / c : xs[Math.min(lo, xs.length - 1)])
  }
  return out
}

/** Exponential smoothing helper used by the conductor and analysers. */
export class Smoother {
  private v: number | null = null
  constructor(public amount = 0.7) {}
  next(x: number): number {
    this.v = this.v === null ? x : this.v * this.amount + x * (1 - this.amount)
    return this.v
  }
  reset() { this.v = null }
}
