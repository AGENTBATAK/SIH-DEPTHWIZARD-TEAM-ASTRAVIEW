import { derived, reference, simulated, type Calibration, type DSMResult, type Scene, type PipelineStage, type DepthEngine } from '../types'
import { buildReferenceDEM, computeValidationMetrics, fitScaleOffset, generateTerrain } from '../lib/terrain'
import { relativeDepthFromTerrain, renderSatellite } from '../lib/raster'
import { inspectGeoTiff, readRgbCanvas } from './geotiff'

export const DEFAULT_GRID = 1024
export const MAX_FILE_BYTES = 64 * 1024 * 1024
export const ACCEPTED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.tif', '.tiff']
export interface ProcessOptions {
  engine?: DepthEngine
  signal?: AbortSignal
  gridSize?: number
  onStage?: (stage: PipelineStage, progress: number, detail?: string) => void
}
export function validateFile(file: File): { message: string } | null {
  if (!file.size) return { message: 'That file is empty.' }
  if (file.size > MAX_FILE_BYTES) return { message: 'Please choose an image smaller than 64 MB.' }
  if (!ACCEPTED_EXTENSIONS.some(ext => file.name.toLowerCase().endsWith(ext))) {
    return { message: 'Unsupported format. Choose PNG, JPG or TIFF.' }
  }
  return null
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try { response = await fetch(`/api${path}`, init) }
  catch (error) {
    if (init?.signal?.aborted) throw error
    throw new Error('Cannot reach the prototype backend. Start it with npm run dev and try again.')
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.error ?? `Backend request failed (${response.status}).`)
  }
  return response.json()
}

type WireScene = Omit<Scene, 'depth' | 'dsm' | 'terrain' | 'metrics'> & {
  depth: Omit<Scene['depth'], 'data'> & { data: number[] }
  dsm: Omit<Scene['dsm'], 'heights'> & { heights: number[] }
  terrain: Omit<Scene['terrain'], 'heights'>
  metrics: Omit<Scene['metrics'], 'rmse' | 'mae' | 'correlation'> & {
    rmse: { value: number | null; provenance: 'simulated'; unit?: string; note?: string }
    mae: { value: number | null; provenance: 'simulated'; unit?: string; note?: string }
    correlation: { value: number | null; provenance: 'simulated'; unit?: string; note?: string }
  }
}
function hydrate(data: WireScene): Scene {
  const heights = Float32Array.from(data.dsm.heights)
  return {
    ...data,
    depth: { ...data.depth, data: Float32Array.from(data.depth.data) },
    dsm: { ...data.dsm, heights },
    terrain: { ...data.terrain, heights },
    metrics: { ...data.metrics,
      rmse: { ...data.metrics.rmse, value: data.metrics.rmse.value ?? NaN },
      mae: { ...data.metrics.mae, value: data.metrics.mae.value ?? NaN },
      correlation: { ...data.metrics.correlation, value: data.metrics.correlation.value ?? NaN },
    },
  }
}
export interface SavedScene { id: string; name: string; filename: string; createdAt: number }
export const listScenes = () => request<SavedScene[]>('/scenes')
export const fetchScene = async (id: string) => hydrate(await request<WireScene>(`/scenes/${encodeURIComponent(id)}`))
export const deleteScene = (id: string) => request<{ deleted: boolean }>(`/scenes/${encodeURIComponent(id)}`, { method: 'DELETE' })
/** The presentation demo is intentionally backend-owned and deterministic. */
export const loadBackendDemo = async (signal?: AbortSignal) => hydrate(await request<WireScene>('/demo', { method: 'POST', signal }))

export type SyntheticStage = 'generation' | 'validation' | 'preprocessing' | 'analysis' | 'result' | 'error'
export type SyntheticStatus = 'processing' | 'completed' | 'failed'

export interface SyntheticInputRecord {
  recordId: string
  tileX: number
  tileY: number
  brightness: number
  reliefSignal: number
  roughness: number
}

export interface ProcessedSyntheticRecord extends SyntheticInputRecord {
  normalizedBrightness: number
  elevationIndex: number
  terrainClass: 'lowland' | 'slope' | 'ridge'
}

export interface SyntheticEvent {
  timestamp: string
  workId: string
  stage: SyntheticStage
  message: string
}

export interface SyntheticWorkRun {
  workId: string
  status: SyntheticStatus
  stage: SyntheticStage
  createdAt: string
  events: SyntheticEvent[]
  inputRecords: SyntheticInputRecord[]
  cleanedRecords: ProcessedSyntheticRecord[]
  validation: { recordsReceived: number; validRecords: number; rejectedRecords: number }
  output: null | {
    workId: string
    processedRecords: ProcessedSyntheticRecord[]
    result: {
      dominantTerrainClass: string
      terrainClassCounts: Record<'lowland' | 'slope' | 'ridge', number>
      averageElevationIndex: number
      meanBrightness: number
    }
  }
  processingTimeMs: number | null
  error: string | null
}

export const startSyntheticWorkRun = () => request<SyntheticWorkRun>('/demo-runs', { method: 'POST' })
export const getSyntheticWorkRun = (workId: string) => request<SyntheticWorkRun>(`/demo-runs/${encodeURIComponent(workId)}`)
export const deleteSyntheticWorkRun = (workId: string) => request<{ deleted: boolean; workId: string }>(`/demo-runs/${encodeURIComponent(workId)}`, { method: 'DELETE' })

/** Decode only a display preview. No depth model, reference lookup or GIS processing. */
export async function processScene(file: File, opts: ProcessOptions = {}): Promise<Scene> {
  const issue = validateFile(file)
  if (issue) throw new Error(issue.message)
  const { signal, onStage } = opts
  signal?.throwIfAborted()
  onStage?.('preprocessing', 0.08, 'Preparing image preview')
  let canvas: HTMLCanvasElement
  let width: number
  let height: number
  if (/\.tiff?$/i.test(file.name)) {
    const inspection = await inspectGeoTiff(file)
    width = inspection.width
    height = inspection.height
    canvas = await readRgbCanvas(inspection, 512)
  } else {
    const bitmap = await createImageBitmap(file)
    width = bitmap.width
    height = bitmap.height
    canvas = document.createElement('canvas')
    const ratio = Math.min(1, 1024 / Math.max(width, height))
    canvas.width = Math.max(1, Math.round(width * ratio))
    canvas.height = Math.max(1, Math.round(height * ratio))
    const ctx = canvas.getContext('2d')
    if (!ctx) { bitmap.close(); throw new Error('Cannot prepare image preview.') }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
  }
  signal?.throwIfAborted()
  onStage?.('depth-inference', 0.35, 'Saving preview and generating synthetic terrain on the server')
  const wire = await request<WireScene>('/process', {
    method: 'POST', signal, headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: file.name, width, height, bytes: file.size, preview: canvas.toDataURL('image/png') }),
  })
  signal?.throwIfAborted()
  onStage?.('terrain-mesh', 0.92, 'Loading saved prototype scene')
  const scene = hydrate(wire)
  onStage?.('ready', 1, 'Saved locally · synthetic terrain ready')
  return scene
}

export interface DemoSceneOptions {
  seed?: number
  gridSize?: number
}

const demoSceneCache = new Map<string, Scene>()
const MAX_CACHED_DEMO_SCENES = 3

/**
 * The demo scene.
 *
 * Built from one seeded height field: the RGB panel is an orthographic render
 * of it, the depth map is its true relative depth, and the mesh is the same
 * raster. That coherence is deliberate — it means the image -> depth -> terrain
 * sequence the site shows is a real transformation of real data, so nothing has
 * to be faked and nothing has to be over-claimed.
 */
export function buildDemoScene(opts: DemoSceneOptions = {}): Scene {
  const size = opts.gridSize ?? DEFAULT_GRID
  const seed = opts.seed ?? 26175
  const cacheKey = `${seed}:${size}`
  const cached = demoSceneCache.get(cacheKey)
  if (cached) return cached
  const terrain = generateTerrain({ seed, size })

  const satellite = renderSatellite(terrain, { resolution: size })
  const depthGrid = relativeDepthFromTerrain(terrain)

  const referenceGrid = buildReferenceDEM(terrain)
  const { scale, offset, correlation } = fitScaleOffset(depthGrid, referenceGrid)

  const refNote =
    'Reference surface for the demo scene: a coarsened, bare-earth version of the same raster with vertical noise, standing in for a public DEM. Simulated — but the fit and the error figures computed from it are real arithmetic.'

  const calibration: Calibration = {
    method: 'reference-dem',
    scale: derived(scale, 'm / unit', 'Least-squares fit of relative depth to the reference surface.'),
    offset: derived(offset, 'm', 'Least-squares fit of relative depth to the reference surface.'),
    correlation: derived(correlation, '', 'Pearson r between relative depth and the reference surface.'),
    sourceLabel: 'SIMULATED REFERENCE DEM',
  }

  const heights = Float32Array.from(terrain.heights)
  let min = Infinity
  let max = -Infinity
  let sum = 0
  for (let i = 0; i < heights.length; i++) {
    if (heights[i] < min) min = heights[i]
    if (heights[i] > max) max = heights[i]
    sum += heights[i]
  }

  const dsmNote = 'Elevation of the demo scene raster. Simulated terrain, exact by construction.'
  const dsm: DSMResult = {
    heights,
    size,
    min: simulated(min, 'm', dsmNote),
    max: simulated(max, 'm', dsmNote),
    mean: simulated(sum / heights.length, 'm', dsmNote),
    calibration,
  }

  const metrics = computeValidationMetrics(heights, referenceGrid, 'SIMULATED REFERENCE DEM')

  const scene: Scene = {
    id: `demo_${seed}`,
    name: 'DEMO_SCENE_01',
    source: 'demo',
    image: {
      filename: 'demo_scene_01.png',
      format: 'png',
      width: simulated(size, 'px', refNote),
      height: simulated(size, 'px', refNote),
      size: simulated(0, 'bytes', 'Generated in-browser; never existed as a file.'),
      url: satellite.toDataURL(),
    },
    geo: {
      georeferenced: true,
      crs: reference('EPSG:4326', undefined, 'Assigned to the demo footprint for illustration.'),
      bounds: simulated(terrain.bounds, 'deg', 'Demo footprint placed near Bhopal for geographic context.'),
      pixelSize: derived(
        [terrain.extentMeters / size, terrain.extentMeters / size] as [number, number],
        'm/px',
        'Scene extent divided by raster width.',
      ),
      bands: simulated(3, undefined, 'Synthetic RGB composite.'),
      extra: [
        { key: 'SENSOR', value: simulated('SYNTHETIC', undefined, 'No sensor was involved.') },
        { key: 'SCENE ID', value: simulated(`DW-${seed}`, undefined, 'Deterministic scene seed.') },
      ],
    },
    depth: {
      data: depthGrid,
      width: size,
      height: size,
      engine: 'simulated',
      elapsedMs: simulated(840, 'ms', 'Illustrative timing for the demo scene, not a benchmark.'),
      isRelative: true,
    },
    dsm,
    terrain,
    metrics,
    reference: { grid: referenceGrid, label: 'SIMULATED REFERENCE DEM' },
    createdAt: Date.now(),
  }
  demoSceneCache.set(cacheKey, scene)
  if (demoSceneCache.size > MAX_CACHED_DEMO_SCENES) {
    const oldestKey = demoSceneCache.keys().next().value
    if (oldestKey) demoSceneCache.delete(oldestKey)
  }
  return scene
}

export { buildReferenceDEM }
