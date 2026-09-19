import { SimplexNoise, clamp, lerp, smoothstep, mulberry32 } from './noise'
import type { Structure, TerrainData, ValidationMetrics } from '../types'
import { derived } from '../types'

/**
 * The terrain engine.
 *
 * Everything visible in DepthWizard's demo mode descends from one seeded height
 * field generated here: the "satellite" RGB image is an orthographic render of
 * it, the depth map is its true depth, the DSM is it, and the mesh you fly
 * through is it. That is a deliberate design choice — it means the
 * image -> depth -> elevation -> terrain sequence the site shows is actually
 * true rather than a staged animation, and nothing in the demo has to claim an
 * accuracy it does not have.
 */

export interface TerrainOptions {
  seed?: number
  /** Grid resolution per side. 256 desktop, 128 mobile. */
  size?: number
  /** Ground extent of one side, metres. */
  extentMeters?: number
  minElevation?: number
  maxElevation?: number
  /** Centre of the geographic footprint, degrees [lon, lat]. */
  center?: [number, number]
  structureCount?: number
}

const DEFAULTS = {
  seed: 26175,
  size: 256,
  extentMeters: 4096,
  minElevation: 0,
  maxElevation: 182,
  center: [77.4126, 23.2599] as [number, number],
  structureCount: 26,
}

/* ------------------------------------------------------------ height field */

/** Continuous terrain function over normalised [0,1]^2. Returns 0..1. */
function terrainFn(n: SimplexNoise, u: number, v: number): number {
  // Broad landform.
  let h = 0.5 + 0.44 * n.fbm(u * 1.15 + 3.7, v * 1.15 - 2.1, 5)

  // A ridge system confined to part of the scene, so the frame contains both
  // relief and flat ground. Flat ground is what makes structure height legible.
  const maskRaw = 0.5 + 0.5 * n.fbm(u * 0.72 - 8.3, v * 0.72 + 5.9, 3)
  const mask = smoothstep(0.42, 0.86, maskRaw)
  h += 0.62 * mask * n.ridged(u * 2.35 + 17.2, v * 2.35 - 4.4, 6)

  // Meandering drainage. Distance to the channel carves a valley, which also
  // gives the flythrough something to follow at low altitude.
  const channel = 0.52 + 0.17 * Math.sin(u * 4.1 + 0.6) + 0.085 * n.fbm(u * 2.6 + 41, 12.5, 3)
  const dist = Math.abs(v - channel)
  const bank = smoothstep(0.0, 0.105, dist)
  const bed = Math.min(h, 0.24 + 0.05 * n.fbm(u * 3.0, v * 3.0, 2))
  h = lerp(bed, h, bank)

  // Gentle plain in the low band so the urban zone has somewhere to sit.
  h = lerp(h, h * 0.55 + 0.16, smoothstep(0.46, 0.2, h))

  // Fine detail, amplitude-scaled so flats stay flat.
  h += 0.028 * n.fbm(u * 9.5 - 22, v * 9.5 + 31, 4) * smoothstep(0.2, 0.6, h)

  return clamp(h, 0, 1)
}

/** Separable box blur over a square grid. Used as a cheap erosion proxy. */
function blur(src: Float32Array, size: number, radius: number): Float32Array {
  if (radius <= 0) return src
  const tmp = new Float32Array(src.length)
  const out = new Float32Array(src.length)
  const w = radius * 2 + 1
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let sum = 0
      for (let k = -radius; k <= radius; k++) {
        sum += src[y * size + clamp(x + k, 0, size - 1)]
      }
      tmp[y * size + x] = sum / w
    }
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let sum = 0
      for (let k = -radius; k <= radius; k++) {
        sum += tmp[clamp(y + k, 0, size - 1) * size + x]
      }
      out[y * size + x] = sum / w
    }
  }
  return out
}

/* ---------------------------------------------------------------- sampling */

/** Bilinear sample of a square grid at normalised (u, v). */
export function sampleGrid(grid: Float32Array, size: number, u: number, v: number): number {
  const x = clamp(u, 0, 1) * (size - 1)
  const y = clamp(v, 0, 1) * (size - 1)
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const x1 = Math.min(x0 + 1, size - 1)
  const y1 = Math.min(y0 + 1, size - 1)
  const fx = x - x0
  const fy = y - y0
  const a = grid[y0 * size + x0]
  const b = grid[y0 * size + x1]
  const c = grid[y1 * size + x0]
  const d = grid[y1 * size + x1]
  return lerp(lerp(a, b, fx), lerp(c, d, fx), fy)
}

/** Surface gradient in metres per metre, via central differences. */
export function gradientAt(
  grid: Float32Array,
  size: number,
  u: number,
  v: number,
  extentMeters: number,
): [number, number] {
  const step = 1 / (size - 1)
  const mPerCell = extentMeters / (size - 1)
  const hx1 = sampleGrid(grid, size, u + step, v)
  const hx0 = sampleGrid(grid, size, u - step, v)
  const hy1 = sampleGrid(grid, size, u, v + step)
  const hy0 = sampleGrid(grid, size, u, v - step)
  return [(hx1 - hx0) / (2 * mPerCell), (hy1 - hy0) / (2 * mPerCell)]
}

/** Slope in degrees from horizontal. */
export function slopeDegAt(
  grid: Float32Array,
  size: number,
  u: number,
  v: number,
  extentMeters: number,
): number {
  const [gx, gy] = gradientAt(grid, size, u, v, extentMeters)
  return (Math.atan(Math.hypot(gx, gy)) * 180) / Math.PI
}

/**
 * Lambertian hillshade. `azimuth` is measured clockwise from north in degrees,
 * `altitude` above the horizon in degrees. Returns 0..1 per cell.
 */
export function hillshade(
  grid: Float32Array,
  size: number,
  extentMeters: number,
  azimuth = 315,
  altitude = 42,
): Float32Array {
  const out = new Float32Array(size * size)
  const az = ((360 - azimuth + 90) * Math.PI) / 180
  const zen = ((90 - altitude) * Math.PI) / 180
  const mPerCell = extentMeters / (size - 1)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const xm = Math.max(x - 1, 0)
      const xp = Math.min(x + 1, size - 1)
      const ym = Math.max(y - 1, 0)
      const yp = Math.min(y + 1, size - 1)
      const dzdx = (grid[y * size + xp] - grid[y * size + xm]) / (2 * mPerCell)
      const dzdy = (grid[yp * size + x] - grid[ym * size + x]) / (2 * mPerCell)
      const slope = Math.atan(Math.hypot(dzdx, dzdy))
      const aspect = Math.atan2(dzdy, -dzdx)
      const s =
        Math.cos(zen) * Math.cos(slope) + Math.sin(zen) * Math.sin(slope) * Math.cos(az - aspect)
      out[y * size + x] = clamp(s, 0, 1)
    }
  }
  return out
}

/* -------------------------------------------------------------- structures */

function placeStructures(
  dtm: Float32Array,
  size: number,
  extentMeters: number,
  count: number,
  seed: number,
  minElev: number,
  maxElev: number,
): Structure[] {
  const rand = mulberry32(seed ^ 0x9e3779b9)
  const placed: Structure[] = []
  // Urban zone as a soft disc, so the settlement reads as a town rather than
  // buildings scattered uniformly across a mountainside.
  const cx = 0.34 + rand() * 0.12
  const cy = 0.66 + rand() * 0.12
  const radius = 0.19

  let attempts = 0
  while (placed.length < count && attempts < count * 240) {
    attempts++
    const ang = rand() * Math.PI * 2
    const r = Math.sqrt(rand()) * radius
    const u = cx + Math.cos(ang) * r
    const v = cy + Math.sin(ang) * r * 0.82
    if (u < 0.05 || u > 0.95 || v < 0.05 || v > 0.95) continue

    if (slopeDegAt(dtm, size, u, v, extentMeters) > 7.5) continue

    const base = sampleGrid(dtm, size, u, v)
    if (base < minElev + (maxElev - minElev) * 0.06) continue // keep out of the channel

    if (placed.some((p) => Math.hypot(p.u - u, p.v - v) < 0.036)) continue

    // Mostly low-rise with a few taller blocks.
    const roll = rand()
    const height = roll > 0.9 ? 34 + rand() * 26 : roll > 0.62 ? 15 + rand() * 16 : 5 + rand() * 9
    const fw = 0.012 + rand() * 0.016
    const fd = 0.012 + rand() * 0.016

    const id = `STRUCTURE_${String(placed.length + 1).padStart(2, '0')}`
    placed.push({
      id,
      label: id.replace('_', ' '),
      u,
      v,
      fw,
      fd,
      baseElevation: derived(base, 'm', 'Ground elevation sampled around the footprint.'),
      topElevation: derived(base + height, 'm', 'Roof surface height in the DSM raster.'),
      height: derived(height, 'm', 'Roof elevation minus surrounding ground elevation.'),
    })
  }
  return placed
}

/** Stamp structures into the raster so the DSM genuinely contains them. */
function bakeStructures(dsm: Float32Array, size: number, structures: Structure[]): void {
  for (const s of structures) {
    const x0 = Math.max(0, Math.floor((s.u - s.fw / 2) * (size - 1)))
    const x1 = Math.min(size - 1, Math.ceil((s.u + s.fw / 2) * (size - 1)))
    const y0 = Math.max(0, Math.floor((s.v - s.fd / 2) * (size - 1)))
    const y1 = Math.min(size - 1, Math.ceil((s.v + s.fd / 2) * (size - 1)))
    const top = s.topElevation.value
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        dsm[y * size + x] = Math.max(dsm[y * size + x], top)
      }
    }
  }
}

/* ------------------------------------------------------------- entry point */

export function generateTerrain(opts: TerrainOptions = {}): TerrainData {
  const { seed, size, extentMeters, minElevation, maxElevation, center, structureCount } = {
    ...DEFAULTS,
    ...opts,
  }

  const n = new SimplexNoise(seed)
  const raw = new Float32Array(size * size)
  for (let y = 0; y < size; y++) {
    const v = y / (size - 1)
    for (let x = 0; x < size; x++) {
      raw[y * size + x] = terrainFn(n, x / (size - 1), v)
    }
  }

  // Light smoothing stands in for erosion and removes single-cell spikes that
  // would otherwise produce nonsense slope readings under the cursor.
  //
  // The radius is in cells, so it has to scale with resolution: a fixed radius
  // of 1 smooths half as far in ground terms at 512² as it does at 256², which
  // would make a higher-resolution scene measurably rougher rather than merely
  // better resolved. Scaling keeps the surface the same surface.
  const smoothed = blur(raw, size, Math.max(1, Math.round(size / 256)))

  let lo = Infinity
  let hi = -Infinity
  for (let i = 0; i < smoothed.length; i++) {
    if (smoothed[i] < lo) lo = smoothed[i]
    if (smoothed[i] > hi) hi = smoothed[i]
  }
  const span = hi - lo || 1
  const dtm = new Float32Array(size * size)
  for (let i = 0; i < dtm.length; i++) {
    dtm[i] = minElevation + ((smoothed[i] - lo) / span) * (maxElevation - minElevation)
  }

  const structures = placeStructures(
    dtm,
    size,
    extentMeters,
    structureCount,
    seed,
    minElevation,
    maxElevation,
  )

  const heights = Float32Array.from(dtm)
  bakeStructures(heights, size, structures)

  let minE = Infinity
  let maxE = -Infinity
  for (let i = 0; i < heights.length; i++) {
    if (heights[i] < minE) minE = heights[i]
    if (heights[i] > maxE) maxE = heights[i]
  }

  return {
    heights,
    size,
    minElevation: minE,
    maxElevation: maxE,
    extentMeters,
    bounds: boundsFromCenter(center, extentMeters),
    structures,
    seed,
  }
}

/** Build a terrain object directly from an arbitrary elevation raster. */
export function terrainFromRaster(
  heights: Float32Array,
  size: number,
  opts: { extentMeters?: number; center?: [number, number]; seed?: number } = {},
): TerrainData {
  const extentMeters = opts.extentMeters ?? DEFAULTS.extentMeters
  const center = opts.center ?? DEFAULTS.center
  let minE = Infinity
  let maxE = -Infinity
  for (let i = 0; i < heights.length; i++) {
    if (heights[i] < minE) minE = heights[i]
    if (heights[i] > maxE) maxE = heights[i]
  }
  return {
    heights,
    size,
    minElevation: minE,
    maxElevation: maxE,
    extentMeters,
    bounds: boundsFromCenter(center, extentMeters),
    structures: [],
    seed: opts.seed ?? 0,
  }
}

/* -------------------------------------------------------------- geographic */

const METERS_PER_DEG_LAT = 111_320

export function boundsFromCenter(
  center: [number, number],
  extentMeters: number,
): [number, number, number, number] {
  const [lon, lat] = center
  const halfLat = extentMeters / 2 / METERS_PER_DEG_LAT
  const halfLon = halfLat / Math.max(0.15, Math.cos((lat * Math.PI) / 180))
  return [lon - halfLon, lat - halfLat, lon + halfLon, lat + halfLat]
}

/** Normalised terrain coords -> [lon, lat]. v = 0 is the north edge. */
export function uvToLonLat(
  bounds: [number, number, number, number],
  u: number,
  v: number,
): [number, number] {
  const [w, s, e, north] = bounds
  return [lerp(w, e, clamp(u, 0, 1)), lerp(north, s, clamp(v, 0, 1))]
}

/* ---------------------------------------------------- reference DEM, error */

/**
 * A stand-in for a coarse public reference DEM. SRTM is 1 arc-second — roughly
 * 30 m posting, much coarser than this scene raster — and it is a bare-earth
 * model, so it does not see buildings. We model exactly those two properties:
 * heavy smoothing, structures absent, plus a vertical noise term.
 *
 * This raster is simulated. It exists so the calibration and validation
 * sections have something real to compute against: the RMSE the site displays
 * is a genuine computation over this pair of rasters, not a number we invented.
 */
export function buildReferenceDEM(terrain: TerrainData): Float32Array {
  const { size } = terrain
  const n = new SimplexNoise(terrain.seed ^ 0x5f356495)
  const radius = Math.max(2, Math.round(size / 42))
  const coarse = blur(terrain.heights, size, radius)
  const out = new Float32Array(size * size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x
      out[i] = coarse[i] + 3.4 * n.fbm((x / size) * 6.2 + 61, (y / size) * 6.2 - 19, 3)
    }
  }
  return out
}

/**
 * Least-squares fit of relative depth onto a reference surface: solves for the
 * (scale, offset) that best maps unitless relative depth into metres. This is
 * the actual arithmetic behind the site's calibration claim.
 */
export function fitScaleOffset(
  relative: Float32Array,
  referenceGrid: Float32Array,
): { scale: number; offset: number; correlation: number } {
  const n = Math.min(relative.length, referenceGrid.length)
  let sx = 0
  let sy = 0
  for (let i = 0; i < n; i++) {
    sx += relative[i]
    sy += referenceGrid[i]
  }
  const mx = sx / n
  const my = sy / n
  let sxy = 0
  let sxx = 0
  let syy = 0
  for (let i = 0; i < n; i++) {
    const dx = relative[i] - mx
    const dy = referenceGrid[i] - my
    sxy += dx * dy
    sxx += dx * dx
    syy += dy * dy
  }
  const scale = sxx === 0 ? 0 : sxy / sxx
  const offset = my - scale * mx
  const denom = Math.sqrt(sxx * syy)
  return { scale, offset, correlation: denom === 0 ? 0 : sxy / denom }
}

export function computeValidationMetrics(
  dsm: Float32Array,
  ref: Float32Array,
  referenceLabel: string,
  everyNth = 1,
): ValidationMetrics {
  const n = Math.min(dsm.length, ref.length)
  let se = 0
  let ae = 0
  let count = 0
  for (let i = 0; i < n; i += everyNth) {
    const d = dsm[i] - ref[i]
    se += d * d
    ae += Math.abs(d)
    count++
  }
  const { correlation } = fitScaleOffset(dsm, ref)
  const note = `Computed over ${count.toLocaleString()} cells against ${referenceLabel}.`
  return {
    rmse: derived(Math.sqrt(se / count), 'm', note),
    mae: derived(ae / count, 'm', note),
    correlation: derived(correlation, '', note),
    sampleCount: derived(count, 'cells', note),
    referenceLabel,
  }
}

/** Signed residual raster, DSM minus reference. */
export function residuals(dsm: Float32Array, ref: Float32Array): Float32Array {
  const out = new Float32Array(Math.min(dsm.length, ref.length))
  for (let i = 0; i < out.length; i++) out[i] = dsm[i] - ref[i]
  return out
}

/* -------------------------------------------------------------- histograms */

export interface Histogram {
  bins: number[]
  min: number
  max: number
}

export function histogram(grid: Float32Array, binCount = 48, range?: [number, number]): Histogram {
  let lo: number
  let hi: number
  if (range) {
    lo = range[0]
    hi = range[1]
  } else {
    lo = Infinity
    hi = -Infinity
    for (let i = 0; i < grid.length; i++) {
      if (grid[i] < lo) lo = grid[i]
      if (grid[i] > hi) hi = grid[i]
    }
  }
  const bins = new Array<number>(binCount).fill(0)
  const span = hi - lo || 1
  for (let i = 0; i < grid.length; i++) {
    const b = clamp(Math.floor(((grid[i] - lo) / span) * binCount), 0, binCount - 1)
    bins[b]++
  }
  return { bins, min: lo, max: hi }
}

/** Sample an elevation transect between two normalised points. */
export function transect(
  grid: Float32Array,
  size: number,
  a: [number, number],
  b: [number, number],
  samples = 96,
): number[] {
  const out: number[] = []
  for (let i = 0; i < samples; i++) {
    const t = i / (samples - 1)
    out.push(sampleGrid(grid, size, lerp(a[0], b[0], t), lerp(a[1], b[1], t)))
  }
  return out
}
