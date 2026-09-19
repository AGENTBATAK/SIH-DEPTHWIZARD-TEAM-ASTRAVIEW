/**
 * Scientific colour ramps.
 *
 * Deliberately restrained: no full-spectrum rainbow anywhere. Rainbow ramps
 * introduce perceptual banding that reads as structure which is not in the data,
 * which is exactly the wrong property for an elevation product.
 *
 * `cividis` is perceptually uniform and colour-vision-deficiency safe, so it is
 * the default for depth. `hypsometric` is the conventional cartographic
 * elevation ramp. Both are also mirrored in GLSL in terrainMaterial.ts — keep
 * the two in sync if you edit the stops.
 */

export type RampName = 'cividis' | 'hypsometric' | 'ice' | 'ember' | 'mono'

type Stop = readonly [number, number, number, number] // t, r, g, b (0..1)

const RAMPS: Record<RampName, readonly Stop[]> = {
  // Cividis — Nuñez, Anderton & Renslow. Blue → grey → yellow, CVD-safe.
  cividis: [
    [0.0, 0.0, 0.135, 0.304],
    [0.25, 0.153, 0.322, 0.44],
    [0.5, 0.36, 0.44, 0.454],
    [0.75, 0.61, 0.573, 0.398],
    [1.0, 1.0, 0.78, 0.216],
  ],
  // Cartographic hypsometric tint: water-adjacent teal → vegetation → rock → snow.
  hypsometric: [
    [0.0, 0.043, 0.153, 0.192],
    [0.16, 0.078, 0.29, 0.31],
    [0.36, 0.212, 0.42, 0.333],
    [0.56, 0.478, 0.478, 0.325],
    [0.76, 0.647, 0.573, 0.47],
    [0.9, 0.804, 0.796, 0.78],
    [1.0, 0.965, 0.976, 1.0],
  ],
  // House ramp: near-black navy → cool blue → electric cyan → white.
  ice: [
    [0.0, 0.02, 0.043, 0.09],
    [0.3, 0.055, 0.161, 0.31],
    [0.6, 0.114, 0.443, 0.612],
    [0.85, 0.286, 0.816, 0.906],
    [1.0, 0.87, 0.98, 1.0],
  ],
  // Warning ramp, used only for error/residual displays.
  ember: [
    [0.0, 0.035, 0.07, 0.12],
    [0.45, 0.243, 0.204, 0.286],
    [0.72, 0.65, 0.353, 0.208],
    [1.0, 0.984, 0.749, 0.286],
  ],
  mono: [
    [0.0, 0.035, 0.047, 0.067],
    [1.0, 0.925, 0.945, 0.976],
  ],
}

export const RAMP_LABELS: Record<RampName, string> = {
  cividis: 'CIVIDIS',
  hypsometric: 'HYPSOMETRIC',
  ice: 'ICE',
  ember: 'RESIDUAL',
  mono: 'MONO',
}

/** Sample a ramp at t (clamped to 0..1). Returns rgb components in 0..1. */
export function sampleRamp(name: RampName, t: number): [number, number, number] {
  const stops = RAMPS[name]
  const x = t < 0 ? 0 : t > 1 ? 1 : t
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i]
    const b = stops[i + 1]
    if (x <= b[0]) {
      const span = b[0] - a[0]
      const f = span === 0 ? 0 : (x - a[0]) / span
      return [a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, a[3] + (b[3] - a[3]) * f]
    }
  }
  const last = stops[stops.length - 1]
  return [last[1], last[2], last[3]]
}

export function rampToCss(name: RampName, steps = 12): string {
  const parts: string[] = []
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1)
    const [r, g, b] = sampleRamp(name, t)
    parts.push(
      `rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)}) ${(t * 100).toFixed(1)}%`,
    )
  }
  return `linear-gradient(90deg, ${parts.join(', ')})`
}

/** Flatten a ramp into a 256x1 RGBA byte array for upload as a WebGL LUT. */
export function rampToLUT(name: RampName, width = 256): Uint8Array {
  const out = new Uint8Array(width * 4)
  for (let i = 0; i < width; i++) {
    const [r, g, b] = sampleRamp(name, i / (width - 1))
    out[i * 4 + 0] = Math.round(r * 255)
    out[i * 4 + 1] = Math.round(g * 255)
    out[i * 4 + 2] = Math.round(b * 255)
    out[i * 4 + 3] = 255
  }
  return out
}
