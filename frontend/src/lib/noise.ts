/**
 * Deterministic noise. Seeded so a given scene id always regenerates byte-for-byte
 * identical terrain — the demo scene must look the same on the projector as it did
 * in rehearsal, and an uploaded scene must survive a route change without shimmering.
 */

/** mulberry32 — small, fast, well-distributed 32-bit PRNG. */
export function mulberry32(seed: number) {
  let a = seed >>> 0
  return function rand(): number {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const F2 = 0.5 * (Math.sqrt(3) - 1)
const G2 = (3 - Math.sqrt(3)) / 6

const GRAD2 = new Float32Array([1, 1, -1, 1, 1, -1, -1, -1, 1, 0, -1, 0, 0, 1, 0, -1])

export class SimplexNoise {
  private perm = new Uint8Array(512)
  private permMod8 = new Uint8Array(512)

  constructor(seed = 1) {
    const rand = mulberry32(seed)
    const p = new Uint8Array(256)
    for (let i = 0; i < 256; i++) p[i] = i
    // Fisher–Yates with the seeded PRNG.
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1))
      const t = p[i]
      p[i] = p[j]
      p[j] = t
    }
    for (let i = 0; i < 512; i++) {
      this.perm[i] = p[i & 255]
      this.permMod8[i] = this.perm[i] % 8
    }
  }

  /** Classic 2D simplex noise, output roughly in [-1, 1]. */
  noise2D(xin: number, yin: number): number {
    const s = (xin + yin) * F2
    const i = Math.floor(xin + s)
    const j = Math.floor(yin + s)
    const t = (i + j) * G2
    const x0 = xin - (i - t)
    const y0 = yin - (j - t)

    const i1 = x0 > y0 ? 1 : 0
    const j1 = x0 > y0 ? 0 : 1

    const x1 = x0 - i1 + G2
    const y1 = y0 - j1 + G2
    const x2 = x0 - 1 + 2 * G2
    const y2 = y0 - 1 + 2 * G2

    const ii = i & 255
    const jj = j & 255

    let n = 0

    let t0 = 0.5 - x0 * x0 - y0 * y0
    if (t0 > 0) {
      const gi = this.permMod8[ii + this.perm[jj]] * 2
      t0 *= t0
      n += t0 * t0 * (GRAD2[gi] * x0 + GRAD2[gi + 1] * y0)
    }

    let t1 = 0.5 - x1 * x1 - y1 * y1
    if (t1 > 0) {
      const gi = this.permMod8[ii + i1 + this.perm[jj + j1]] * 2
      t1 *= t1
      n += t1 * t1 * (GRAD2[gi] * x1 + GRAD2[gi + 1] * y1)
    }

    let t2 = 0.5 - x2 * x2 - y2 * y2
    if (t2 > 0) {
      const gi = this.permMod8[ii + 1 + this.perm[jj + 1]] * 2
      t2 *= t2
      n += t2 * t2 * (GRAD2[gi] * x2 + GRAD2[gi + 1] * y2)
    }

    return 70 * n
  }

  /** Fractal Brownian motion — stacked octaves, output roughly in [-1, 1]. */
  fbm(x: number, y: number, octaves = 5, lacunarity = 2.0, gain = 0.5): number {
    let amp = 1
    let freq = 1
    let sum = 0
    let norm = 0
    for (let o = 0; o < octaves; o++) {
      sum += amp * this.noise2D(x * freq, y * freq)
      norm += amp
      amp *= gain
      freq *= lacunarity
    }
    return sum / norm
  }

  /**
   * Ridged multifractal — the sharp-crested variant that reads as eroded
   * mountain range rather than rolling hills. Output in [0, 1].
   */
  ridged(x: number, y: number, octaves = 5, lacunarity = 2.0, gain = 0.5): number {
    let amp = 1
    let freq = 1
    let sum = 0
    let norm = 0
    for (let o = 0; o < octaves; o++) {
      const n = 1 - Math.abs(this.noise2D(x * freq, y * freq))
      sum += amp * n * n
      norm += amp
      amp *= gain
      freq *= lacunarity
    }
    return sum / norm
  }
}

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1)
  return t * t * (3 - 2 * t)
}
export const invLerp = (a: number, b: number, v: number) => (b === a ? 0 : (v - a) / (b - a))
