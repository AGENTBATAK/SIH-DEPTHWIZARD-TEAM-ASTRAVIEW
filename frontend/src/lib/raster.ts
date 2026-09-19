import { SimplexNoise, clamp, lerp, smoothstep } from './noise'
import { hillshade, sampleGrid } from './terrain'
import { sampleRamp, type RampName } from './colormaps'
import type { TerrainData } from '../types'

/**
 * Raster rendering — turns height fields into the images the interface shows.
 *
 * The satellite render here is the reason the site's central claim holds up:
 * the "RGB input" panel is an orthographic render of the same height field the
 * viewer flies through, so the depth map derived from it is ground truth rather
 * than a decorative gradient.
 */

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

/* ------------------------------------------------------------- landcover */

interface LandcoverSample {
  r: number
  g: number
  b: number
}

/** Desaturated, dark-processed composite — reads as a real sensor product. */
function landcover(
  t: number,
  slope: number,
  moisture: number,
  urban: number,
  water: number,
): LandcoverSample {
  // Base classes, all deliberately low-chroma.
  const deepWater = { r: 0.031, g: 0.078, b: 0.114 }
  const shallow = { r: 0.055, g: 0.129, b: 0.157 }
  const vegetation = { r: 0.086, g: 0.157, b: 0.125 }
  const scrub = { r: 0.153, g: 0.169, b: 0.129 }
  const soil = { r: 0.204, g: 0.184, b: 0.153 }
  const rock = { r: 0.216, g: 0.224, b: 0.231 }
  const bare = { r: 0.278, g: 0.286, b: 0.294 }

  const mixc = (a: LandcoverSample, b: LandcoverSample, f: number): LandcoverSample => ({
    r: lerp(a.r, b.r, f),
    g: lerp(a.g, b.g, f),
    b: lerp(a.b, b.b, f),
  })

  // Elevation-driven succession.
  let c = mixc(vegetation, scrub, smoothstep(0.18, 0.45, t))
  c = mixc(c, soil, smoothstep(0.42, 0.66, t))
  c = mixc(c, rock, smoothstep(0.6, 0.84, t))
  c = mixc(c, bare, smoothstep(0.82, 1.0, t))

  // Steep faces expose rock regardless of altitude.
  c = mixc(c, rock, smoothstep(22, 46, slope) * 0.75)

  // Moisture darkens and greens the low ground.
  c = mixc(c, vegetation, moisture * 0.45 * (1 - smoothstep(0.3, 0.7, t)))

  // Water bodies.
  c = mixc(c, shallow, smoothstep(0.35, 0.75, water))
  c = mixc(c, deepWater, smoothstep(0.7, 1.0, water))

  // Built surfaces: flat, grey, slightly brighter than their surroundings.
  if (urban > 0) {
    c = mixc(c, { r: 0.294, g: 0.31, b: 0.325 }, clamp(urban, 0, 1))
  }

  return c
}

export interface SatelliteOptions {
  /** Output resolution. Defaults to the terrain grid size. */
  resolution?: number
  sunAzimuth?: number
  sunAltitude?: number
  /** 0..1 — atmospheric wash toward the scene's haze colour. */
  haze?: number
}

/**
 * Orthographic "satellite" render of a terrain. Returns a canvas so callers can
 * use it as an <img> src, a THREE.CanvasTexture, or a MapLibre image source.
 */
export function renderSatellite(terrain: TerrainData, opts: SatelliteOptions = {}): HTMLCanvasElement {
  const res = opts.resolution ?? terrain.size
  const { heights, size, extentMeters, minElevation, maxElevation } = terrain
  const shade = hillshade(
    heights,
    size,
    extentMeters,
    opts.sunAzimuth ?? 312,
    opts.sunAltitude ?? 38,
  )
  const noise = new SimplexNoise(terrain.seed ^ 0x2545f491)
  const span = maxElevation - minElevation || 1
  const waterLevel = minElevation + span * 0.055

  // Urban mask from the structure list — this is why buildings appear in the
  // RGB panel and therefore in the depth map derived from it.
  const urbanMask = new Float32Array(res * res)
  for (const s of terrain.structures) {
    const pad = 0.006
    const x0 = Math.max(0, Math.floor((s.u - s.fw / 2 - pad) * (res - 1)))
    const x1 = Math.min(res - 1, Math.ceil((s.u + s.fw / 2 + pad) * (res - 1)))
    const y0 = Math.max(0, Math.floor((s.v - s.fd / 2 - pad) * (res - 1)))
    const y1 = Math.min(res - 1, Math.ceil((s.v + s.fd / 2 + pad) * (res - 1)))
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) urbanMask[y * res + x] = 1
    }
  }

  const canvas = makeCanvas(res, res)
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(res, res)

  for (let y = 0; y < res; y++) {
    const v = y / (res - 1)
    for (let x = 0; x < res; x++) {
      const u = x / (res - 1)
      const i = y * res + x

      const elev = sampleGrid(heights, size, u, v)
      const t = clamp((elev - minElevation) / span, 0, 1)
      const sh = sampleGrid(shade, size, u, v)

      // Slope in degrees, recovered from the shade gradient cheaply.
      const e1 = sampleGrid(heights, size, u + 1 / size, v)
      const e2 = sampleGrid(heights, size, u, v + 1 / size)
      const mPerCell = extentMeters / (size - 1)
      const slope =
        (Math.atan(Math.hypot((e1 - elev) / mPerCell, (e2 - elev) / mPerCell)) * 180) / Math.PI

      const moisture = 0.5 + 0.5 * noise.fbm(u * 4.4 + 9, v * 4.4 - 3, 3)
      const water = smoothstep(waterLevel + span * 0.02, waterLevel - span * 0.01, elev)

      let { r, g, b } = landcover(t, slope, moisture, urbanMask[i], water)

      // Hillshade, kept off pure black so shadowed faces retain detail.
      const lit = 0.28 + 0.95 * sh
      r *= lit
      g *= lit
      b *= lit

      // Sensor grain.
      const grain = (noise.noise2D(x * 0.9, y * 0.9) + 1) * 0.5
      const gr = (grain - 0.5) * 0.035
      r += gr
      g += gr
      b += gr

      // Atmospheric wash toward the product's navy.
      const haze = (opts.haze ?? 0.14) * smoothstep(0.15, 1.0, t)
      r = lerp(r, 0.106, haze * 0.5)
      g = lerp(g, 0.145, haze * 0.5)
      b = lerp(b, 0.192, haze * 0.5)

      const o = i * 4
      img.data[o] = clamp(r, 0, 1) * 255
      img.data[o + 1] = clamp(g, 0, 1) * 255
      img.data[o + 2] = clamp(b, 0, 1) * 255
      img.data[o + 3] = 255
    }
  }

  ctx.putImageData(img, 0, 0)
  return canvas
}

/* ---------------------------------------------------------- scalar fields */

export interface ScalarRenderOptions {
  ramp?: RampName
  /** Explicit value range. Defaults to the field's own min/max. */
  range?: [number, number]
  /** Draw contour lines at this interval, in field units. */
  contourInterval?: number
  contourOpacity?: number
  /** Symmetric ramp around zero — used for signed residuals. */
  diverging?: boolean
}

/** Render any square scalar grid through a colour ramp. */
export function renderScalar(
  grid: Float32Array,
  size: number,
  opts: ScalarRenderOptions = {},
): HTMLCanvasElement {
  const ramp = opts.ramp ?? 'cividis'
  let lo: number
  let hi: number
  if (opts.range) {
    lo = opts.range[0]
    hi = opts.range[1]
  } else {
    lo = Infinity
    hi = -Infinity
    for (let i = 0; i < grid.length; i++) {
      if (grid[i] < lo) lo = grid[i]
      if (grid[i] > hi) hi = grid[i]
    }
  }
  if (opts.diverging) {
    const m = Math.max(Math.abs(lo), Math.abs(hi))
    lo = -m
    hi = m
  }
  const span = hi - lo || 1

  const canvas = makeCanvas(size, size)
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(size, size)

  const interval = opts.contourInterval ?? 0
  const contourOpacity = opts.contourOpacity ?? 0.34

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x
      const value = grid[i]
      const t = clamp((value - lo) / span, 0, 1)
      let [r, g, b] = sampleRamp(ramp, t)

      if (interval > 0) {
        // Distance to the nearest contour level, in field units, normalised by
        // the local gradient so line width stays even across flat and steep ground.
        const xp = grid[y * size + Math.min(x + 1, size - 1)]
        const yp = grid[Math.min(y + 1, size - 1) * size + x]
        const grad = Math.max(1e-4, Math.hypot(xp - value, yp - value))
        const phase = value / interval
        const d = Math.abs(phase - Math.round(phase)) * interval
        const line = 1 - smoothstep(0, grad * 0.9, d)
        if (line > 0) {
          const f = line * contourOpacity
          r = lerp(r, 0.85, f)
          g = lerp(g, 0.96, f)
          b = lerp(b, 1.0, f)
        }
      }

      const o = i * 4
      img.data[o] = r * 255
      img.data[o + 1] = g * 255
      img.data[o + 2] = b * 255
      img.data[o + 3] = 255
    }
  }

  ctx.putImageData(img, 0, 0)
  return canvas
}

/**
 * Hillshaded elevation map: ramp colour, Lambertian relief shading and metric
 * contours composited in one pass. This is the 2D counterpart of the 3D view
 * and shares its ramp, so the two never disagree about what a colour means.
 */
export function renderElevationMap(
  terrain: TerrainData,
  opts: {
    ramp?: RampName
    contourInterval?: number
    /** Vertical exaggeration applied to the shading only. */
    exaggeration?: number
    sunAzimuth?: number
    sunAltitude?: number
    resolution?: number
  } = {},
): HTMLCanvasElement {
  const res = opts.resolution ?? terrain.size
  const ramp = opts.ramp ?? 'hypsometric'
  const exaggeration = opts.exaggeration ?? 1

  // Exaggerating the raster before shading is what makes the slider visibly
  // change relief in 2D, matching what it does to the mesh in 3D.
  const scaled = new Float32Array(terrain.heights.length)
  for (let i = 0; i < scaled.length; i++) {
    scaled[i] = terrain.minElevation + (terrain.heights[i] - terrain.minElevation) * exaggeration
  }
  const shade = hillshade(
    scaled,
    terrain.size,
    terrain.extentMeters,
    opts.sunAzimuth ?? 315,
    opts.sunAltitude ?? 40,
  )

  const span = terrain.maxElevation - terrain.minElevation || 1
  const interval = opts.contourInterval ?? span / 14

  const canvas = makeCanvas(res, res)
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(res, res)

  for (let y = 0; y < res; y++) {
    const v = y / (res - 1)
    for (let x = 0; x < res; x++) {
      const u = x / (res - 1)
      const elev = sampleGrid(terrain.heights, terrain.size, u, v)
      const t = clamp((elev - terrain.minElevation) / span, 0, 1)
      const sh = sampleGrid(shade, terrain.size, u, v)

      let [r, g, b] = sampleRamp(ramp, t)
      const lit = 0.32 + 0.9 * sh
      r *= lit
      g *= lit
      b *= lit

      // Contours. The band width has to be normalised by the local gradient,
      // otherwise a fixed threshold in elevation units draws hairlines on steep
      // ground and broad speckled blotches everywhere flat.
      const stepU = 1 / (res - 1)
      const ex = sampleGrid(terrain.heights, terrain.size, Math.min(1, u + stepU), v)
      const ey = sampleGrid(terrain.heights, terrain.size, u, Math.min(1, v + stepU))
      const grad = Math.max(1e-4, Math.hypot(ex - elev, ey - elev))

      const phase = elev / interval
      const d = Math.abs(phase - Math.round(phase)) * interval
      const isIndex = Math.round(phase) % 5 === 0
      const line = 1 - smoothstep(0, grad * (isIndex ? 1.2 : 0.8), d)
      if (line > 0) {
        const f = line * (isIndex ? 0.62 : 0.34)
        r = lerp(r, 0.78, f)
        g = lerp(g, 0.93, f)
        b = lerp(b, 1.0, f)
      }

      const o = (y * res + x) * 4
      img.data[o] = clamp(r, 0, 1) * 255
      img.data[o + 1] = clamp(g, 0, 1) * 255
      img.data[o + 2] = clamp(b, 0, 1) * 255
      img.data[o + 3] = 255
    }
  }

  ctx.putImageData(img, 0, 0)
  return canvas
}

/* ---------------------------------------------------------------- filters */

/** Sobel edge magnitude of a canvas, rendered as a cool monochrome plate. */
export function renderEdges(source: HTMLCanvasElement | ImageData): HTMLCanvasElement {
  const src =
    source instanceof ImageData
      ? source
      : source.getContext('2d')!.getImageData(0, 0, source.width, source.height)
  const { width: w, height: h, data } = src

  const lum = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) {
    lum[i] = (data[i * 4] * 0.2126 + data[i * 4 + 1] * 0.7152 + data[i * 4 + 2] * 0.0722) / 255
  }

  const canvas = makeCanvas(w, h)
  const ctx = canvas.getContext('2d')!
  const out = ctx.createImageData(w, h)

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const xm = Math.max(x - 1, 0)
      const xp = Math.min(x + 1, w - 1)
      const ym = Math.max(y - 1, 0)
      const yp = Math.min(y + 1, h - 1)
      const gx =
        -lum[ym * w + xm] - 2 * lum[y * w + xm] - lum[yp * w + xm] +
        lum[ym * w + xp] + 2 * lum[y * w + xp] + lum[yp * w + xp]
      const gy =
        -lum[ym * w + xm] - 2 * lum[ym * w + x] - lum[ym * w + xp] +
        lum[yp * w + xm] + 2 * lum[yp * w + x] + lum[yp * w + xp]
      const m = clamp(Math.hypot(gx, gy) * 1.35, 0, 1)
      const o = (y * w + x) * 4
      out.data[o] = 12 + m * 120
      out.data[o + 1] = 18 + m * 210
      out.data[o + 2] = 26 + m * 240
      out.data[o + 3] = 255
    }
  }

  ctx.putImageData(out, 0, 0)
  return canvas
}

/* ------------------------------------------------------------------ depth */

/**
 * Relative depth of a nadir view of this terrain.
 *
 * For a downward-looking sensor the highest ground is nearest the camera, so
 * normalised elevation *is* the relative depth — this is ground truth for the
 * demo scene, not an estimate. Convention matches the depth model output:
 * 1 = nearest, 0 = furthest. Unitless and datum-free by construction.
 */
export function relativeDepthFromTerrain(terrain: TerrainData): Float32Array {
  const { heights, minElevation, maxElevation } = terrain
  const span = maxElevation - minElevation || 1
  const out = new Float32Array(heights.length)
  for (let i = 0; i < heights.length; i++) out[i] = (heights[i] - minElevation) / span
  return out
}

/* ----------------------------------------------------------------- utility */

export function canvasToDataURL(canvas: HTMLCanvasElement, type = 'image/png'): string {
  return canvas.toDataURL(type)
}

/** Downsample an arbitrary image to a square Float32 luminance grid. */
export function imageToLuminanceGrid(
  source: CanvasImageSource,
  size: number,
): { grid: Float32Array; canvas: HTMLCanvasElement } {
  const canvas = makeCanvas(size, size)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(source, 0, 0, size, size)
  const { data } = ctx.getImageData(0, 0, size, size)
  const grid = new Float32Array(size * size)
  for (let i = 0; i < size * size; i++) {
    grid[i] = (data[i * 4] * 0.2126 + data[i * 4 + 1] * 0.7152 + data[i * 4 + 2] * 0.0722) / 255
  }
  return { grid, canvas }
}

/** Resample a square grid to a different resolution, bilinearly. */
export function resampleGrid(grid: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return Float32Array.from(grid)
  const out = new Float32Array(to * to)
  for (let y = 0; y < to; y++) {
    for (let x = 0; x < to; x++) {
      out[y * to + x] = sampleGrid(grid, from, x / (to - 1), y / (to - 1))
    }
  }
  return out
}
