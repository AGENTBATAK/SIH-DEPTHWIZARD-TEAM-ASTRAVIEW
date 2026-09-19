import { fromBlob, type GeoTIFFImage } from 'geotiff'
import { measured, type GeoMetadata, type Tagged } from '../types'

/**
 * GeoTIFF inspection, in the browser, with no server round trip.
 *
 * Everything this module reports is tagged `measured` because it is read
 * directly out of the file's TIFF/GeoTIFF tags. Where we cannot determine
 * something — most importantly, reprojection from an arbitrary projected CRS to
 * WGS84 — we say so rather than guessing.
 */

export interface GeoTiffInspection {
  meta: GeoMetadata
  width: number
  height: number
  samplesPerPixel: number
  /** True when band 0 plausibly holds elevation rather than radiometry. */
  looksLikeElevation: boolean
  /** WGS84 [w, s, e, n] when we could determine it honestly, else undefined. */
  wgs84Bounds?: [number, number, number, number]
  image: GeoTIFFImage
}

/* --------------------------------------------------------- UTM -> WGS84 */

const WGS84_A = 6378137.0
const WGS84_F = 1 / 298.257223563

/**
 * Inverse UTM projection (Krüger series, WGS84). Implemented directly because
 * pulling proj4 in for one projection family is not worth the bundle, and UTM
 * covers the overwhelming majority of distributed satellite products.
 */
function utmToLonLat(easting: number, northing: number, zone: number, northern: boolean): [number, number] {
  const k0 = 0.9996
  const e2 = 2 * WGS84_F - WGS84_F * WGS84_F
  const e1sq = e2 / (1 - e2)

  const x = easting - 500000
  const y = northern ? northing : northing - 10000000

  const m = y / k0
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2))
  const mu = m / (WGS84_A * (1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 * e2 * e2) / 256))

  const phi1 =
    mu +
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) +
    ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu)

  const sinPhi1 = Math.sin(phi1)
  const cosPhi1 = Math.cos(phi1)
  const tanPhi1 = Math.tan(phi1)

  const n1 = WGS84_A / Math.sqrt(1 - e2 * sinPhi1 * sinPhi1)
  const t1 = tanPhi1 * tanPhi1
  const c1 = e1sq * cosPhi1 * cosPhi1
  const r1 = (WGS84_A * (1 - e2)) / Math.pow(1 - e2 * sinPhi1 * sinPhi1, 1.5)
  const d = x / (n1 * k0)

  const lat =
    phi1 -
    ((n1 * tanPhi1) / r1) *
      ((d * d) / 2 -
        ((5 + 3 * t1 + 10 * c1 - 4 * c1 * c1 - 9 * e1sq) * d ** 4) / 24 +
        ((61 + 90 * t1 + 298 * c1 + 45 * t1 * t1 - 252 * e1sq - 3 * c1 * c1) * d ** 6) / 720)

  const lon =
    (d -
      ((1 + 2 * t1 + c1) * d ** 3) / 6 +
      ((5 - 2 * c1 + 28 * t1 - 3 * c1 * c1 + 8 * e1sq + 24 * t1 * t1) * d ** 5) / 120) /
    cosPhi1

  const lonOrigin = ((zone - 1) * 6 - 180 + 3) * (Math.PI / 180)
  return [((lonOrigin + lon) * 180) / Math.PI, (lat * 180) / Math.PI]
}

/** EPSG code -> UTM zone descriptor, for the 326xx/327xx families. */
function utmFromEpsg(code: number): { zone: number; northern: boolean } | null {
  if (code >= 32601 && code <= 32660) return { zone: code - 32600, northern: true }
  if (code >= 32701 && code <= 32760) return { zone: code - 32700, northern: false }
  return null
}

/* ------------------------------------------------------------- inspection */

interface FileDirectory {
  ModelPixelScale?: number[]
  ModelTiepoint?: number[]
  ImageDescription?: string
  Software?: string
  DateTime?: string
  SampleFormat?: number[]
  BitsPerSample?: number[]
  GDAL_NODATA?: string
}

export async function inspectGeoTiff(file: File): Promise<GeoTiffInspection> {
  const tiff = await fromBlob(file)
  const image = await tiff.getImage()

  const width = image.getWidth()
  const height = image.getHeight()
  const samplesPerPixel = image.getSamplesPerPixel()
  const fd = image.getFileDirectory() as FileDirectory
  const geoKeys = (image.getGeoKeys?.() ?? {}) as Record<string, number | string>

  // ----- CRS
  const projected = Number(geoKeys.ProjectedCSTypeGeoKey ?? 0)
  const geographic = Number(geoKeys.GeographicTypeGeoKey ?? 0)
  const epsg = projected || geographic
  const crs: Tagged<string> | undefined = epsg
    ? measured(`EPSG:${epsg}`, undefined, 'Read from the GeoTIFF GeoKey directory.')
    : undefined

  // ----- pixel size
  const scale = fd.ModelPixelScale
  const pixelSize: Tagged<[number, number]> | undefined = scale
    ? measured(
        [Math.abs(scale[0]), Math.abs(scale[1])] as [number, number],
        projected ? 'm/px' : 'deg/px',
        'ModelPixelScale tag.',
      )
    : undefined

  // ----- bounds, in native CRS units
  let nativeBbox: [number, number, number, number] | undefined
  try {
    const bb = image.getBoundingBox()
    if (bb && bb.every((n) => Number.isFinite(n))) {
      nativeBbox = [bb[0], bb[1], bb[2], bb[3]]
    }
  } catch {
    nativeBbox = undefined
  }

  // ----- WGS84 bounds, only where we can do it honestly
  let wgs84Bounds: [number, number, number, number] | undefined
  let boundsNote = 'Corner coordinates derived from the tie point and pixel scale tags.'
  if (nativeBbox) {
    if (geographic === 4326 && !projected) {
      wgs84Bounds = nativeBbox
    } else {
      const utm = utmFromEpsg(projected)
      if (utm) {
        const [w, s] = utmToLonLat(nativeBbox[0], nativeBbox[1], utm.zone, utm.northern)
        const [e, n] = utmToLonLat(nativeBbox[2], nativeBbox[3], utm.zone, utm.northern)
        wgs84Bounds = [w, s, e, n]
        boundsNote = `Inverse-projected from EPSG:${projected} (UTM zone ${utm.zone}${utm.northern ? 'N' : 'S'}) to WGS84.`
      } else if (projected) {
        boundsNote = `Extent is in EPSG:${projected} units. DepthWizard does not reproject this CRS in the browser, so it is shown unconverted.`
      }
    }
  }

  const extra: GeoMetadata['extra'] = []
  const push = (key: string, value: string | undefined, note?: string) => {
    if (value) extra.push({ key, value: measured(value, undefined, note) })
  }
  push('BIT DEPTH', fd.BitsPerSample ? `${fd.BitsPerSample[0]}-bit` : undefined)
  push(
    'SAMPLE FORMAT',
    fd.SampleFormat ? sampleFormatLabel(fd.SampleFormat[0]) : undefined,
    'TIFF SampleFormat tag.',
  )
  push('NODATA', fd.GDAL_NODATA?.trim(), 'GDAL_NODATA tag.')
  push('SOFTWARE', fd.Software, 'TIFF Software tag.')
  push('ACQUIRED', fd.DateTime, 'TIFF DateTime tag.')
  if (nativeBbox && !wgs84Bounds) {
    push(
      'NATIVE EXTENT',
      `${nativeBbox[0].toFixed(1)}, ${nativeBbox[1].toFixed(1)} → ${nativeBbox[2].toFixed(1)}, ${nativeBbox[3].toFixed(1)}`,
      boundsNote,
    )
  }

  // Single-band float or int16 is the usual signature of an elevation product.
  const sampleFormat = fd.SampleFormat?.[0] ?? 1
  const bits = fd.BitsPerSample?.[0] ?? 8
  const looksLikeElevation = samplesPerPixel === 1 && (sampleFormat === 3 || bits >= 16)

  const meta: GeoMetadata = {
    georeferenced: Boolean(crs || nativeBbox),
    crs,
    bounds: wgs84Bounds ? measured(wgs84Bounds, 'deg', boundsNote) : undefined,
    pixelSize,
    bands: measured(samplesPerPixel, undefined, 'SamplesPerPixel tag.'),
    extra,
  }

  return { meta, width, height, samplesPerPixel, looksLikeElevation, wgs84Bounds, image }
}

function sampleFormatLabel(v: number): string {
  return v === 1 ? 'UINT' : v === 2 ? 'INT' : v === 3 ? 'FLOAT' : `CODE ${v}`
}

/**
 * Read band 0 into a square grid at `size`. Used when the file is a DEM, in
 * which case the values are genuine elevations and DepthWizard skips depth
 * estimation entirely rather than pretending to infer what it was handed.
 */
export async function readElevationBand(
  inspection: GeoTiffInspection,
  size: number,
): Promise<Float32Array> {
  const rasters = await inspection.image.readRasters({
    samples: [0],
    width: size,
    height: size,
    interleave: false,
    resampleMethod: 'bilinear',
  })
  const band = (Array.isArray(rasters) ? rasters[0] : rasters) as ArrayLike<number>

  // Reject nodata sentinels so a single -9999 does not flatten the whole scene.
  const values = new Float32Array(size * size)
  let lo = Infinity
  let hi = -Infinity
  for (let i = 0; i < values.length; i++) {
    const v = Number(band[i])
    values[i] = v
    if (v > -1e4 && v < 1e5) {
      if (v < lo) lo = v
      if (v > hi) hi = v
    }
  }
  const fallback = Number.isFinite(lo) ? lo : 0
  for (let i = 0; i < values.length; i++) {
    if (!(values[i] > -1e4 && values[i] < 1e5)) values[i] = fallback
  }
  return values
}

/** Read the file as an RGB canvas — used when the TIFF is imagery, not elevation. */
export async function readRgbCanvas(
  inspection: GeoTiffInspection,
  size: number,
): Promise<HTMLCanvasElement> {
  const count = Math.min(3, inspection.samplesPerPixel)
  const rasters = await inspection.image.readRasters({
    samples: Array.from({ length: count }, (_, i) => i),
    width: size,
    height: size,
    interleave: false,
    resampleMethod: 'bilinear',
  })
  const bands = (Array.isArray(rasters) ? rasters : [rasters]) as ArrayLike<number>[]

  // Percentile stretch — raw satellite radiometry is almost never 0..255.
  const stretch = bands.map((band) => {
    const sorted = Float64Array.from({ length: size * size }, (_, i) => Number(band[i])).sort()
    return [sorted[Math.floor(sorted.length * 0.02)], sorted[Math.floor(sorted.length * 0.98)]]
  })

  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(size, size)
  for (let i = 0; i < size * size; i++) {
    for (let c = 0; c < 3; c++) {
      const src = bands[Math.min(c, bands.length - 1)]
      const [lo, hi] = stretch[Math.min(c, stretch.length - 1)]
      const t = (Number(src[i]) - lo) / (hi - lo || 1)
      img.data[i * 4 + c] = Math.max(0, Math.min(1, t)) * 255
    }
    img.data[i * 4 + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  return canvas
}
