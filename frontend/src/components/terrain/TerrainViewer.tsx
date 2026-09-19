import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import {
  Compass,
  Eye,
  Map as MapIcon,
  Maximize2,
  Minimize2,
  MousePointerClick,
  Plane,
  Ruler,
  RotateCcw,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import { useSceneStore } from '../../hooks/useScene'
import { TerrainSurface, StructureMarkers, Particles } from './TerrainSurface'
import { TerrainInteraction, MeasurementLayer, CursorReticle } from './TerrainInteraction'
import {
  FlythroughController,
  createMoveState,
  flythroughStartPose,
  type FlythroughReadout,
  type MoveState,
} from './FlythroughController'
import { TerrainControls } from './TerrainControls'
import { CursorHUD, FlythroughHUD, StructureCard, TouchControls } from './TerrainHUD'
import { WebGLGate } from './WebGLGate'
import { Button } from '../ui/Button'
import { Tag } from '../ui/Primitives'
import type { TerrainHit } from '../../lib/raycast'
import { cn } from '../../lib/utils'

const MapPanel = lazy(() => import('../map/MapPanel').then((m) => ({ default: m.MapPanel })))

/**
 * The 3D terrain explorer.
 *
 * Renders in two variants from one implementation: `embedded` sits inside the
 * scroll narrative with orbit interaction only, and `full` takes the viewport
 * with layer controls, measurement, structure inspection and the flythrough.
 * They share the store, so launching the full explorer carries the camera
 * intent and layer state rather than resetting the user's context.
 */

// Closer and steeper than a neutral three-quarter view: the terrain should fill
// its frame rather than float in the middle of it.
const ORBIT_POSE = {
  position: new THREE.Vector3(0.5, 0.56, 0.66),
  target: new THREE.Vector3(0, 0.03, 0),
}

/* ----------------------------------------------------------- camera moves */

interface Pose {
  position: THREE.Vector3
  look: THREE.Vector3
}

/**
 * Interpolates the camera between poses. Runs inside the frame loop rather than
 * through GSAP so it shares a clock with the renderer — a tween driven from
 * outside the loop visibly stutters against terrain that is animating inside it.
 */
function CameraDirector({
  target,
  onArrive,
}: {
  target: Pose | null
  onArrive: () => void
}) {
  const look = useRef(new THREE.Vector3(0, 0.02, 0))
  const settled = useRef(0)

  useFrame(({ camera }, delta) => {
    if (!target) return
    const k = Math.min(1, delta * 2.6)
    camera.position.lerp(target.position, k)
    look.current.lerp(target.look, k)
    camera.lookAt(look.current)

    if (camera.position.distanceTo(target.position) < 0.012) {
      settled.current += delta
      if (settled.current > 0.12) {
        settled.current = 0
        onArrive()
      }
    } else {
      settled.current = 0
    }
  })

  return null
}

/* ------------------------------------------------------------------ scene */

function ExplorerScene({
  transition,
  onTransitionDone,
  onHover,
  onPick,
  moveRef,
  onFlythroughReadout,
  onExitFlythrough,
  onMouseLookActive,
  interactive,
}: {
  transition: Pose | null
  onTransitionDone: () => void
  onHover: (hit: TerrainHit | null) => void
  onPick: (hit: TerrainHit) => void
  moveRef: React.MutableRefObject<MoveState>
  onFlythroughReadout: (r: FlythroughReadout) => void
  onExitFlythrough: () => void
  onMouseLookActive: (active: boolean) => void
  interactive: boolean
}) {
  const scene = useSceneStore((s) => s.scene)
  const layers = useSceneStore((s) => s.layers)
  const exaggeration = useSceneStore((s) => s.exaggeration)
  const ramp = useSceneStore((s) => s.ramp)
  const cameraMode = useSceneStore((s) => s.cameraMode)
  const measurements = useSceneStore((s) => s.measurements)
  const pendingPoint = useSceneStore((s) => s.pendingPoint)
  const selectedStructure = useSceneStore((s) => s.selectedStructure)
  const selectStructure = useSceneStore((s) => s.selectStructure)
  const cursor = useSceneStore((s) => s.cursor)

  const [cursorPoint, setCursorPoint] = useState<THREE.Vector3 | null>(null)
  const { invalidate } = useThree()

  const handleHover = useCallback(
    (hit: TerrainHit | null) => {
      setCursorPoint(hit ? hit.point : null)
      onHover(hit)
      invalidate()
    },
    [onHover, invalidate],
  )

  if (!scene) return null
  const { terrain } = scene

  const flying = cameraMode === 'flythrough'
  const orbiting = cameraMode === 'orbit' && !transition

  return (
    <>
      <color attach="background" args={['#040507']} />
      <fog attach="fog" args={['#040507', 1.4, 4.2]} />

      <Suspense fallback={null}>
        <TerrainSurface
          terrain={terrain}
          textureUrl={scene.image.url}
          ramp={ramp}
          exaggeration={exaggeration}
          layers={layers}
          cursorUv={cursor ? [cursor.u, cursor.v] : null}
          fogNear={flying ? 0.3 : 1.2}
          fogFar={flying ? 1.9 : 3.6}
        />

        {layers.structures && (
          <StructureMarkers
            terrain={terrain}
            exaggeration={exaggeration}
            selectedId={selectedStructure?.id ?? null}
            onSelect={(id) => {
              const s = terrain.structures.find((st) => st.id === id) ?? null
              selectStructure(s)
            }}
          />
        )}
      </Suspense>

      <MeasurementLayer measurements={measurements} pending={pendingPoint} cursor={cursorPoint} />
      {!flying && <CursorReticle position={cursorPoint} />}

      {!flying && <Particles count={180} spread={2.4} />}

      <TerrainInteraction
        terrain={terrain}
        exaggeration={exaggeration}
        enabled={interactive && !flying && !transition}
        onHover={handleHover}
        onPick={onPick}
      />

      <FlythroughController
        terrain={terrain}
        exaggeration={exaggeration}
        moveRef={moveRef}
        enabled={flying && !transition}
        onReadout={onFlythroughReadout}
        onExit={onExitFlythrough}
        onMouseLookActive={onMouseLookActive}
      />

      <CameraDirector target={transition} onArrive={onTransitionDone} />

      {orbiting && (
        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.07}
          minDistance={0.14}
          maxDistance={2.6}
          maxPolarAngle={Math.PI * 0.495}
          target={[ORBIT_POSE.target.x, ORBIT_POSE.target.y, ORBIT_POSE.target.z]}
        />
      )}
    </>
  )
}

/* --------------------------------------------------------------- wrapper */

export function TerrainViewer({ variant = 'embedded' }: { variant?: 'embedded' | 'full' }) {
  const scene = useSceneStore((s) => s.scene)
  const cameraMode = useSceneStore((s) => s.cameraMode)
  const setCameraMode = useSceneStore((s) => s.setCameraMode)
  const viewMode = useSceneStore((s) => s.viewMode)
  const setViewMode = useSceneStore((s) => s.setViewMode)
  const tool = useSceneStore((s) => s.tool)
  const setTool = useSceneStore((s) => s.setTool)
  const exaggeration = useSceneStore((s) => s.exaggeration)
  const setCursor = useSceneStore((s) => s.setCursor)
  const addMeasurementPoint = useSceneStore((s) => s.addMeasurementPoint)
  const clearMeasurements = useSceneStore((s) => s.clearMeasurements)
  const measurements = useSceneStore((s) => s.measurements)
  const selectedStructure = useSceneStore((s) => s.selectedStructure)
  const cursor = useSceneStore((s) => s.cursor)

  const containerRef = useRef<HTMLDivElement | null>(null)
  const moveRef = useRef<MoveState>(createMoveState())
  const [transition, setTransition] = useState<Pose | null>(null)
  const [pendingMode, setPendingMode] = useState<'orbit' | 'flythrough' | null>(null)
  const [flyReadout, setFlyReadout] = useState<FlythroughReadout | null>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [panelOpen, setPanelOpen] = useState(variant === 'full')
  const [isTouch, setIsTouch] = useState(false)
  const [mouseLookActive, setMouseLookActive] = useState(false)

  useEffect(() => {
    setIsTouch(window.matchMedia('(pointer: coarse)').matches)
  }, [])

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const onHover = useCallback(
    (hit: TerrainHit | null) => {
      setCursor(
        hit
          ? {
              u: hit.u,
              v: hit.v,
              elevation: hit.elevation,
              slope: hit.slope,
              lon: hit.lon,
              lat: hit.lat,
            }
          : null,
      )
    },
    [setCursor],
  )

  const onPick = useCallback(
    (hit: TerrainHit) => {
      if (tool !== 'measure' || !scene) return
      addMeasurementPoint(
        { x: hit.point.x, y: hit.point.y, z: hit.point.z },
        scene.terrain.extentMeters,
      )
    },
    [tool, scene, addMeasurementPoint],
  )

  const enterFlythrough = useCallback(() => {
    if (!scene) return
    setMouseLookActive(false)
    const pose = flythroughStartPose(scene.terrain, exaggeration)
    setPendingMode('flythrough')
    setTransition({ position: pose.position, look: pose.look })
  }, [scene, exaggeration])

  const exitFlythrough = useCallback(() => {
    if (document.pointerLockElement) document.exitPointerLock()
    setPendingMode('orbit')
    setTransition({ position: ORBIT_POSE.position.clone(), look: ORBIT_POSE.target.clone() })
    setCameraMode('orbit')
    setFlyReadout(null)
    setMouseLookActive(false)
  }, [setCameraMode])

  const onTransitionDone = useCallback(() => {
    if (pendingMode) setCameraMode(pendingMode)
    setPendingMode(null)
    setTransition(null)
  }, [pendingMode, setCameraMode])

  const resetCamera = useCallback(() => {
    setPendingMode('orbit')
    setTransition({ position: ORBIT_POSE.position.clone(), look: ORBIT_POSE.target.clone() })
  }, [])

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    if (document.fullscreenElement) document.exitFullscreen()
    else el.requestFullscreen?.()
  }, [])

  const flying = cameraMode === 'flythrough'

  const canvasProps = useMemo(
    () => ({
      dpr: [1, isTouch ? 1.3 : 1.8] as [number, number],
      gl: {
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance' as const,
        stencil: false,
      },
      camera: {
        position: [ORBIT_POSE.position.x, ORBIT_POSE.position.y, ORBIT_POSE.position.z] as [
          number,
          number,
          number,
        ],
        fov: flying ? 62 : 42,
        near: 0.002,
        far: 24,
      },
    }),
    [isTouch, flying],
  )

  if (!scene) {
    return (
      <div className="dw-grid-bg grid min-h-[70vh] w-full place-items-center bg-void">
        <span className="dw-label">NO SCENE LOADED</span>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      data-flythrough-lock
      data-cursor={flying ? undefined : 'crosshair'}
      className={cn(
        'relative w-full overflow-hidden bg-void',
        variant === 'full'
          ? 'h-[100svh]'
          : 'h-[76svh] min-h-[520px] rounded-[calc(2rem-0.375rem)] border border-white/[0.05] shadow-[inset_0_1px_1px_rgba(255,255,255,0.09)]',
      )}
    >
      {/* ------------------------------------------------------------ stage */}
      {viewMode === '3d' ? (
        <WebGLGate terrain={scene.terrain}>
          <Canvas {...canvasProps}>
            <ExplorerScene
              transition={transition}
              onTransitionDone={onTransitionDone}
              onHover={onHover}
              onPick={onPick}
              moveRef={moveRef}
              onFlythroughReadout={setFlyReadout}
              onExitFlythrough={exitFlythrough}
              onMouseLookActive={setMouseLookActive}
              interactive
            />
          </Canvas>
        </WebGLGate>
      ) : (
        <Suspense
          fallback={
            <div className="dw-grid-bg grid size-full place-items-center">
              <span className="dw-label">LOADING MAP ENGINE…</span>
            </div>
          }
        >
          <MapPanel scene={scene} />
        </Suspense>
      )}

      {/* ------------------------------------------------------------- top */}
      {!flying && (
        <>
          <div className="pointer-events-none absolute left-4 top-4 flex items-start gap-3">
            <div className="dw-panel-glass pointer-events-auto px-3 py-2">
              <div className="dw-label mb-1">SCENE</div>
              <div className="flex items-center gap-2">
                <span className="dw-value text-[11px] text-ink">
                  DEPTHWIZARD / {scene.name}
                </span>
                {scene.source === 'demo' ? <Tag tone="amber">DEMO</Tag> : <Tag tone="amber">SYNTHETIC UPLOAD</Tag>}
              </div>
            </div>
          </div>

          <div className="absolute right-4 top-4 flex items-center gap-2">
            <div className="dw-panel-glass flex items-center p-1">
              {(['map', '3d'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setViewMode(mode)}
                  data-cursor="button"
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.16em] transition-colors',
                    viewMode === mode ? 'bg-cyan-core/12 text-cyan-core' : 'text-ink-faint hover:text-ink-dim',
                  )}
                >
                  {mode === 'map' ? <MapIcon className="size-3" /> : <Compass className="size-3" />}
                  {mode === 'map' ? '2D MAP' : '3D VIEW'}
                </button>
              ))}
            </div>

            {variant === 'embedded' && viewMode === '3d' && (
              <button
                type="button"
                onClick={() => setPanelOpen((v) => !v)}
                aria-label="Toggle layer controls"
                data-cursor="button"
                className="dw-panel-glass grid size-9 place-items-center text-ink-dim transition-colors hover:text-cyan-core"
              >
                {panelOpen ? <X className="size-4" /> : <SlidersHorizontal className="size-4" />}
              </button>
            )}

            <button
              type="button"
              onClick={toggleFullscreen}
              aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              data-cursor="button"
              className="dw-panel-glass grid size-9 place-items-center text-ink-dim transition-colors hover:text-cyan-core"
            >
              {fullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
            </button>
          </div>
        </>
      )}

      {/* --------------------------------------------------------- controls */}
      {viewMode === '3d' && panelOpen && !flying && (
        <div className="absolute right-4 top-16 z-20 w-[248px]">
          {/* Bounded so the control stack can never grow down over the readout
              panels pinned to the bottom-right corner. */}
          <TerrainControls
            compact
            className={
              variant === 'full'
                ? 'max-h-[calc(100svh-17rem)]'
                : 'max-h-[calc(76svh-15rem)]'
            }
          />
        </div>
      )}

      {/* ------------------------------------------------------------ tools */}
      {!flying && viewMode === '3d' && (
        <div className="absolute bottom-4 left-4 flex flex-wrap items-center gap-2">
          <Button
            variant={tool === 'measure' ? 'primary' : 'outline'}
            size="sm"
            magnetic={false}
            icon={<Ruler className="size-3.5" />}
            onClick={() => setTool(tool === 'measure' ? 'none' : 'measure')}
          >
            Measure
          </Button>
          <Button
            variant={tool === 'inspect' ? 'primary' : 'outline'}
            size="sm"
            magnetic={false}
            icon={<MousePointerClick className="size-3.5" />}
            onClick={() => setTool(tool === 'inspect' ? 'none' : 'inspect')}
          >
            Inspect
          </Button>
          <Button
            variant="outline"
            size="sm"
            magnetic={false}
            icon={<RotateCcw className="size-3.5" />}
            onClick={resetCamera}
          >
            Reset
          </Button>
          {measurements.length > 0 && (
            <Button variant="ghost" size="sm" magnetic={false} onClick={clearMeasurements}>
              Clear ({measurements.length})
            </Button>
          )}
          <Button
            variant="primary"
            size="sm"
            magnetic={false}
            icon={<Plane className="size-3.5" />}
            onClick={enterFlythrough}
          >
            Enter flythrough
          </Button>
        </div>
      )}

      {/* Tool hint */}
      {tool === 'measure' && !flying && (
        <div className="dw-panel-glass pointer-events-none absolute bottom-16 left-4 max-w-xs px-3 py-2">
          <p className="text-[11px] leading-relaxed text-ink-dim">
            Click two points on the terrain. Distance is measured across the ground, not through
            the air.
          </p>
        </div>
      )}

      {/* ----------------------------------------------------------- readouts */}
      {!flying && viewMode === '3d' && (
        <div className="absolute bottom-4 right-4 flex flex-col items-end gap-3">
          {selectedStructure && <StructureCard structure={selectedStructure} />}
          <CursorHUD cursor={cursor} />
        </div>
      )}

      {/* --------------------------------------------------------- flythrough */}
      {flying && (
        <>
          <FlythroughHUD readout={flyReadout} onExit={exitFlythrough} />
          {isTouch && <TouchControls moveRef={moveRef} />}
          {!isTouch && !mouseLookActive && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <div className="dw-panel-glass px-5 py-3">
                <p className="dw-label text-cyan-core">CLICK TO CAPTURE MOUSE LOOK</p>
              </div>
            </div>
          )}
        </>
      )}

      {/* Transition veil */}
      {transition && (
        <div className="pointer-events-none absolute inset-0 flex items-end justify-center pb-24">
          <div className="dw-panel-glass flex items-center gap-2 px-3 py-2">
            <Eye className="size-3.5 text-cyan-core" />
            <span className="dw-label text-cyan-core">
              {pendingMode === 'flythrough' ? 'DESCENDING TO LOW ALTITUDE' : 'RETURNING TO ORBIT'}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
