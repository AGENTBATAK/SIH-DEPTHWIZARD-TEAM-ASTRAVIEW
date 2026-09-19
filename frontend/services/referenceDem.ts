import { reference, type Tagged } from '../types'
import { clamp } from '../lib/noise'

/**
 * Reference elevation retrieval.
 *
 * This is the module that makes DepthWizard's central claim real rather than
 * rhetorical. Monocular depth gives relative structure; it becomes metric only
 * when anchored to something that already knows about metres. Here that anchor
 * is the AWS Open Data terrain tile set (Mapzen "terrarium" encoding), which is
 * built from SRTM and other public sources, is free, and needs no API key.
 *
 * Every path through here can fail — the network, CORS, a scene outside SRTM's
 * 60N/56S coverage. Failure is expected and handled: the caller falls back to an
 * uncalibrated scene and the interface says so plainly instead of inventing a
 * scale factor.
 */

const TERRARIUM_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium'
const TILE_SIZE = 256

export interface ReferenceDemResult {
  grid: Float32Array
  size: number
  sourceLabel: string
  attribution: string
  zoom: number
  tilesFetched: number
  min: Tagged<number>
  max: Tagged<number>
}

/* --------------------------------------------------------------- tile math */

const lonToTileX = (lon: number, z: number) => ((lon + 180) / 360) * Math.pow(2, z)

function latToTileY(lat: number, z: number): number {
  const rad = (lat * Math.PI) / 180
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * Math.pow(2, z)
}

/** Largest zoom whose tile footprint for this bbox stays within `maxTiles`. */
function chooseZoom(bounds: [number, number, number, number], maxTiles = 9): number {
  const [w, s, e, n] = bounds
  for (let z = 14; z >= 4; z--) {
    const x0 = Math.floor(lonToTileX(w, z))
    const x1 = Math.floor(lonToTileX(e, z))
    const y0 = Math.floor(latToTileY(n, z))
    const y1 = Math.floor(latToTileY(s, z))
    if ((x1 - x0 + 1) * (y1 - y0 + 1) <= maxTiles) return z
  }
  return 4
}

function loadTile(url: string, signal?: AbortSignal): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    let settled = false
    const done = (v: HTMLImageElement | null) => {
      if (settled) return
      settled = true
      resolve(v)
    }
    img.onload = () => done(img)
    img.onerror = () => done(null)
    signal?.addEventListener('abort', () => done(null), { once: true })
    // Guard against a tile server that accepts the connection then stalls.
    setTimeout(() => done(null), 12000)
    img.src = url
  })
}

/* ------------------------------------------------------------------ fetch */

export async function fetchReferenceDem(
  bounds: [number, number, number, number],
  size: number,
  signal?: AbortSignal,
): Promise<ReferenceDemResult | null> {
  const [w, s, e, n] = bounds

  // SRTM-derived tiles have no data outside roughly 60N..56S.
  if (n > 60 || s < -56) return null

  const zoom = chooseZoom(bounds)
  const x0 = Math.floor(lonToTileX(w, zoom))
  const x1 = Math.floor(lonToTileX(e, zoom))
  const y0 = Math.floor(latToTileY(n, zoom))
  const y1 = Math.floor(latToTileY(s, zoom))
  const cols = x1 - x0 + 1
  const rows = y1 - y0 + 1

  const mosaic = document.createElement('canvas')
  mosaic.width = cols * TILE_SIZE
  mosaic.height = rows * TILE_SIZE
  const mctx = mosaic.getContext('2d', { willReadFrequently: true })
  if (!mctx) return null

  const requests: Promise<{ img: HTMLImageElement | null; cx: number; cy: number }>[] = []
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      requests.push(
        loadTile(`${TERRARIUM_URL}/${zoom}/${tx}/${ty}.png`, signal).then((img) => ({
          img,
          cx: tx - x0,
          cy: ty - y0,
        })),
      )
    }
  }

  const tiles = await Promise.all(requests)
  const ok = tiles.filter((t) => t.img)
  // A partial mosaic would produce a reference surface with holes in it, which
  // would quietly corrupt the fit. Require everything or nothing.
  if (ok.length !== tiles.length || ok.length === 0) return null

  for (const t of ok) mctx.drawImage(t.img!, t.cx * TILE_SIZE, t.cy * TILE_SIZE)

  let pixels: ImageData
  try {
    pixels = mctx.getImageData(0, 0, mosaic.width, mosaic.height)
  } catch {
    // Tainted canvas — the tile server did not send permissive CORS headers.
    return null
  }

  // Sub-window of the mosaic corresponding to the requested bounds.
  const px0 = (lonToTileX(w, zoom) - x0) * TILE_SIZE
  const px1 = (lonToTileX(e, zoom) - x0) * TILE_SIZE
  const py0 = (latToTileY(n, zoom) - y0) * TILE_SIZE
  const py1 = (latToTileY(s, zoom) - y0) * TILE_SIZE

  const grid = new Float32Array(size * size)
  let min = Infinity
  let max = -Infinity
  for (let gy = 0; gy < size; gy++) {
    const sy = clamp(Math.round(py0 + ((py1 - py0) * gy) / (size - 1)), 0, mosaic.height - 1)
    for (let gx = 0; gx < size; gx++) {
      const sx = clamp(Math.round(px0 + ((px1 - px0) * gx) / (size - 1)), 0, mosaic.width - 1)
      const o = (sy * mosaic.width + sx) * 4
      // Terrarium encoding: elevation = (R * 256 + G + B / 256) - 32768
      const elev = pixels.data[o] * 256 + pixels.data[o + 1] + pixels.data[o + 2] / 256 - 32768
      grid[gy * size + gx] = elev
      if (elev < min) min = elev
      if (elev > max) max = elev
    }
  }

  const note = `Mapzen terrarium tiles at zoom ${zoom}, derived from SRTM and other public elevation sources.`
  return {
    grid,
    size,
    zoom,
    tilesFetched: ok.length,
    sourceLabel: `AWS TERRAIN TILES · Z${zoom}`,
    attribution: 'Elevation: AWS Open Data Terrain Tiles (SRTM, NED, and other public sources)',
    min: reference(min, 'm', note),
    max: reference(max, 'm', note),
  }
}
