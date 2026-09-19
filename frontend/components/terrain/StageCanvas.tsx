import { useMemo, useRef, useSyncExternalStore } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { HeroTerrainContent } from '../hero/HeroTerrain'
import { SpaceScene } from '../prologue/SpaceScene'
import { WebGLGate } from './WebGLGate'
import { useSceneStore } from '../../hooks/useScene'
import { useReducedMotion } from '../../hooks/useSmoothScroll'
import {
  descentCameraAt,
  descentStateAt,
  HERO_CAMERA,
  type DescentState,
} from '../prologue/descent'
import { isPrologueActive, riseRef, stage, subscribeStage } from '../prologue/stageState'

/**
 * The shared WebGL stage.
 *
 * One canvas carries both the space prologue and the hero terrain, because two
 * canvases cannot share a camera — and a descent that ends by cross-dissolving
 * between two independent cameras reads as a cut, which is exactly the moment
 * the illusion has to survive. Here a single camera flies the whole way down and
 * the terrain simply fades up beneath it.
 *
 * Depth precision is the reason the globe is theatrically scaled rather than
 * physically placed: with `near` at 0.01 there is no budget for a 6371 km
 * sphere, so the globe is a small object close to the camera that grows. The
 * frustum never changes, so the terrain renders exactly as it did before the
 * prologue existed.
 */

const STAGE_BACKGROUND = '#040507'

/**
 * Drives the camera.
 *
 * Two regimes share one camera: the scrubbed descent while the prologue is on
 * screen, and the hero's slow signature orbit once it is not. They meet at
 * `HERO_CAMERA`, which is the orbit's own position at elapsed time zero, so the
 * handover has no discontinuity to hide.
 */
function StageCamera({
  animate,
  prologue,
}: {
  animate: boolean
  prologue: boolean
}) {
  const { camera, pointer, viewport } = useThree()
  const target = useMemo(() => new THREE.Vector3(), [])
  const orbitTarget = useMemo(
    () => new THREE.Vector3(...HERO_CAMERA.target),
    [],
  )
  const elapsed = useRef(0)

  useFrame((_, delta) => {
    const d = prologue ? stage.descent : 1

    if (d < 0.999) {
      // Scrubbed descent: position is a pure function of scroll, so scrubbing
      // backwards retraces the flight exactly.
      // Aspect matters: the nadir hold has to sit low enough that the terrain
      // plate overfills the frame, and how low that is depends on how wide the
      // window is. See nadirHeightFor.
      const shot = descentCameraAt(d, viewport.aspect)
      camera.position.set(...shot.position)
      target.set(...shot.target)
      camera.lookAt(target)
      elapsed.current = 0
      return
    }

    // Arrived. The hero's own orbit takes over — the same rig as before, with
    // its clock starting at the moment of arrival so it begins exactly where
    // the descent left the camera.
    elapsed.current += delta
    const t = animate ? elapsed.current * 0.055 : 0
    const radius = 1.02
    const baseX = Math.sin(t) * radius * 0.42
    const baseZ = Math.cos(t) * radius

    // Pointer parallax, eased so a fast mouse never snaps the camera.
    const px = animate ? pointer.x * 0.1 : 0
    const py = animate ? pointer.y * 0.055 : 0

    const k = Math.min(1, delta * 2.4)
    camera.position.x += (baseX + px - camera.position.x) * k
    camera.position.y += (0.44 - py - camera.position.y) * k
    camera.position.z += (baseZ - camera.position.z) * k
    camera.lookAt(orbitTarget)
  })

  return null
}

/**
 * Evaluates the descent curve once per frame and publishes the result.
 *
 * Everything downstream — globe, atmosphere, stars, terrain opacity, assembly —
 * reads from this single object, so the whole cinematic stays consistent by
 * construction rather than by several components agreeing about scroll.
 */
function DescentDriver({
  stateRef,
  terrainOpacity,
  prologue,
}: {
  stateRef: React.RefObject<DescentState>
  terrainOpacity: React.RefObject<number>
  prologue: boolean
}) {
  const { viewport } = useThree()

  useFrame(() => {
    if (!prologue) {
      terrainOpacity.current = 1
      riseRef.current = 1
      return
    }
    const s = descentStateAt(stage.descent, viewport.aspect)
    stateRef.current = s
    terrainOpacity.current = s.terrainOpacity
    riseRef.current = s.rise
  })
  return null
}

function StageScene({ prologue, animate }: { prologue: boolean; animate: boolean }) {
  const scene = useSceneStore((s) => s.scene)
  const stateRef = useRef<DescentState>(descentStateAt(0))
  const terrainOpacity = useRef(prologue ? 0 : 1)

  return (
    <>
      <color attach="background" args={[STAGE_BACKGROUND]} />

      <DescentDriver
        stateRef={stateRef}
        terrainOpacity={terrainOpacity}
        prologue={prologue}
      />
      <StageCamera animate={animate} prologue={prologue} />

      {prologue && <SpaceScene stateRef={stateRef} />}

      {scene && (
        <HeroTerrainContent
          terrain={scene.terrain}
          textureUrl={scene.image.url}
          riseRef={riseRef}
          opacityRef={terrainOpacity}
          animate={animate}
          // The descent owns opacity directly, so rise must not also control
          // it — otherwise the flat plate the cloud reveals is invisible.
          riseDrivesOpacity={!prologue}
        />
      )}
    </>
  )
}

/**
 * Fixed, full-viewport canvas spanning the prologue and the hero.
 *
 * It is `position: fixed` rather than pinned by ScrollTrigger because the
 * camera already encodes scroll position: pinning would move the element while
 * the camera also moved, and the two would fight. Instead the canvas holds
 * still, the camera flies, and the DOM scrolls over the top of it.
 */
export function StageCanvas() {
  const reduced = useReducedMotion()
  const scene = useSceneStore((s) => s.scene)

  const prologue = useSyncExternalStore(subscribeStage, isPrologueActive, () => false)

  if (!scene) {
    return <div className="dw-grid-bg size-full opacity-40" aria-hidden />
  }

  return (
    <WebGLGate terrain={scene.terrain}>
      <Canvas
        dpr={[1, 2]}
        gl={{
          antialias: true,
          powerPreference: 'high-performance',
          alpha: false,
          stencil: false,
          depth: true,
        }}
        camera={{
          position: prologue ? [0, 0.92, 2.4] : HERO_CAMERA.position,
          fov: 38,
          near: 0.01,
          far: 32,
        }}
        // Nothing on the stage is interactive; skipping the event layer removes
        // a raycast against a 262k-vertex mesh on every pointer move.
        events={undefined}
        style={{ pointerEvents: 'none' }}
      >
        <StageScene prologue={prologue} animate={!reduced} />
      </Canvas>
    </WebGLGate>
  )
}
