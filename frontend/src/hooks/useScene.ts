import { create } from 'zustand'
import type { DepthEngine, Measurement, PipelineStage, Scene, Structure } from '../types'
import type { RampName } from '../lib/colormaps'
import { buildDemoScene, DEFAULT_GRID } from '../services/pipelineService'
import type { EngineStatus } from '../services/depth'

/**
 * One store for the whole application.
 *
 * The landing page and the /explorer route share it, so launching the explorer
 * carries the current scene, camera intent and layer state across the route
 * change instead of rebuilding a terrain the user has already been looking at.
 */

export type ViewMode = '3d' | 'map'
export type CameraMode = 'orbit' | 'flythrough'
export type Tool = 'none' | 'measure' | 'inspect'

export interface LayerState {
  texture: boolean
  elevation: boolean
  contours: boolean
  wireframe: boolean
  referenceDem: boolean
  grid: boolean
  structures: boolean
}

export interface CursorReadout {
  u: number
  v: number
  elevation: number
  slope: number
  lon: number
  lat: number
}

interface SceneStore {
  /* ------------------------------------------------------------- lifecycle */
  scene: Scene | null
  stage: PipelineStage
  progress: number
  stageDetail: string
  error: string | null

  /* ------------------------------------------------------------- inference */
  engine: DepthEngine
  engineStatus: EngineStatus
  setEngine: (engine: DepthEngine) => void
  setEngineStatus: (status: EngineStatus) => void

  /* ------------------------------------------------------------- rendering */
  gridSize: number
  exaggeration: number
  ramp: RampName
  layers: LayerState
  viewMode: ViewMode
  cameraMode: CameraMode
  tool: Tool
  showProvenance: boolean

  /* ---------------------------------------------------------- interaction */
  cursor: CursorReadout | null
  measurements: Measurement[]
  pendingPoint: { x: number; y: number; z: number } | null
  selectedStructure: Structure | null
  /** Normalised endpoints of the analytics transect. */
  transectPoints: [[number, number], [number, number]]

  /* -------------------------------------------------------------- actions */
  loadDemo: (seed?: number) => void
  setScene: (scene: Scene) => void
  setStage: (stage: PipelineStage, progress: number, detail?: string) => void
  setError: (error: string | null) => void
  reset: () => void

  setExaggeration: (v: number) => void
  setRamp: (r: RampName) => void
  toggleLayer: (key: keyof LayerState) => void
  setViewMode: (m: ViewMode) => void
  setCameraMode: (m: CameraMode) => void
  setTool: (t: Tool) => void
  toggleProvenance: () => void

  setCursor: (c: CursorReadout | null) => void
  addMeasurementPoint: (p: { x: number; y: number; z: number }, extentMeters: number) => void
  clearMeasurements: () => void
  selectStructure: (s: Structure | null) => void
  setTransect: (a: [number, number], b: [number, number]) => void
}

export const useSceneStore = create<SceneStore>((set, get) => ({
  scene: null,
  stage: 'idle',
  progress: 0,
  stageDetail: '',
  error: null,

  engine: 'simulated',
  engineStatus: { state: 'idle' },
  setEngine: (engine) => set({ engine }),
  setEngineStatus: (engineStatus) => set({ engineStatus }),

  gridSize: DEFAULT_GRID,
  exaggeration: 1.6,
  ramp: 'hypsometric',
  layers: {
    texture: true,
    elevation: true,
    contours: true,
    wireframe: false,
    referenceDem: false,
    grid: true,
    structures: true,
  },
  viewMode: '3d',
  cameraMode: 'orbit',
  tool: 'none',
  showProvenance: false,

  cursor: null,
  measurements: [],
  pendingPoint: null,
  selectedStructure: null,
  transectPoints: [
    [0.12, 0.78],
    [0.88, 0.24],
  ],

  loadDemo: (seed) => {
    // The canonical demo is a data contract, not a presentation LOD. Mobile
    // rendering may cap DPR and mesh density, but the source height field and
    // all derived raster products must remain the same 1024² dataset.
    const gridSize = DEFAULT_GRID
    const scene = buildDemoScene({ seed, gridSize })
    set({
      scene,
      gridSize,
      stage: 'ready',
      progress: 1,
      stageDetail: 'Demo scene ready',
      error: null,
      measurements: [],
      pendingPoint: null,
      selectedStructure: null,
    })
  },

  setScene: (scene) =>
    set({
      scene,
      stage: 'ready',
      progress: 1,
      error: null,
      measurements: [],
      pendingPoint: null,
      selectedStructure: null,
    }),

  setStage: (stage, progress, detail) =>
    set({ stage, progress, stageDetail: detail ?? get().stageDetail }),

  setError: (error) => set({ error, stage: error ? 'error' : get().stage }),

  reset: () => set({ stage: 'idle', progress: 0, stageDetail: '', error: null }),

  setExaggeration: (exaggeration) => set({ exaggeration }),
  setRamp: (ramp) => set({ ramp }),
  toggleLayer: (key) => set((s) => ({ layers: { ...s.layers, [key]: !s.layers[key] } })),
  setViewMode: (viewMode) => set({ viewMode }),
  setCameraMode: (cameraMode) => set({ cameraMode }),
  setTool: (tool) => set({ tool, pendingPoint: null }),
  toggleProvenance: () => set((s) => ({ showProvenance: !s.showProvenance })),

  setCursor: (cursor) => set({ cursor }),

  addMeasurementPoint: (p, extentMeters) => {
    const pending = get().pendingPoint
    if (!pending) {
      set({ pendingPoint: p })
      return
    }
    // World units are normalised to a unit square; convert to ground metres.
    const dx = (p.x - pending.x) * extentMeters
    const dz = (p.z - pending.z) * extentMeters
    const groundDistance = Math.hypot(dx, dz)
    const deltaElevation = p.y - pending.y
    const slope = (Math.atan2(Math.abs(deltaElevation), Math.max(groundDistance, 1e-6)) * 180) / Math.PI

    const note = 'Computed from the DSM raster along the line between the two picked points.'
    const measurement: Measurement = {
      id: `m_${Date.now().toString(36)}`,
      a: pending,
      b: p,
      distance: { value: groundDistance, provenance: 'derived', unit: 'm', note },
      deltaElevation: { value: deltaElevation, provenance: 'derived', unit: 'm', note },
      slope: { value: slope, provenance: 'derived', unit: '°', note },
    }
    set((s) => ({ measurements: [...s.measurements, measurement], pendingPoint: null }))
  },

  clearMeasurements: () => set({ measurements: [], pendingPoint: null }),
  selectStructure: (selectedStructure) => set({ selectedStructure }),
  setTransect: (a, b) => set({ transectPoints: [a, b] }),
}))

/** Convenience selector — the terrain, or null when no scene is loaded. */
export const useTerrain = () => useSceneStore((s) => s.scene?.terrain ?? null)
