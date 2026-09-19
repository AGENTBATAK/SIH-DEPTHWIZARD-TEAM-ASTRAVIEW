import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import type { TerrainData } from '../../types'
import { surfaceY, worldToUv } from '../../lib/raycast'
import { sampleGrid, slopeDegAt, uvToLonLat } from '../../lib/terrain'

/**
 * First-person flythrough.
 *
 * Movement is in ground-plane space rather than along the view vector, so
 * looking down does not drive the camera into the terrain — the standard
 * mistake in a naive WASD implementation. Altitude follows the surface with a
 * spring rather than snapping, which keeps the HUD's altitude readout stable
 * enough to be legible while crossing broken ground.
 */

export interface FlythroughReadout {
  altitude: number
  agl: number
  slope: number
  heading: number
  lon: number
  lat: number
  speed: number
}

export interface MoveState {
  forward: number
  right: number
  up: number
  boost: boolean
}

export const createMoveState = (): MoveState => ({ forward: 0, right: 0, up: 0, boost: false })

const EYE_HEIGHT_M = 45
const BASE_SPEED_M = 260

/**
 * Entry pose for the flythrough — over the settlement, facing the ridge.
 * Exported so the camera transition can fly to exactly this pose before the
 * controller takes over, making the hand-off invisible.
 */
export function flythroughStartPose(terrain: TerrainData, exaggeration: number) {
  const startU = 0.34
  const startV = 0.72
  const x = startU - 0.5
  const z = 0.5 - startV
  const ground = surfaceY(x, z, terrain, exaggeration)
  const y = ground + (EYE_HEIGHT_M / terrain.extentMeters) * exaggeration
  return {
    position: new THREE.Vector3(x, y, z),
    look: new THREE.Vector3(0.2, ground, -0.1),
  }
}

export function FlythroughController({
  terrain,
  exaggeration,
  moveRef,
  onReadout,
  onExit,
  onMouseLookActive,
  enabled,
}: {
  terrain: TerrainData
  exaggeration: number
  /** Shared movement state, so on-screen touch controls can drive it too. */
  moveRef: React.MutableRefObject<MoveState>
  onReadout: (r: FlythroughReadout) => void
  onExit: () => void
  onMouseLookActive: (active: boolean) => void
  enabled: boolean
}) {
  const { camera, gl } = useThree()
  const keys = useRef<Record<string, boolean>>({})
  const velocity = useRef(new THREE.Vector3())
  const smoothedY = useRef<number | null>(null)
  const readoutClock = useRef(0)

  const forwardVec = useMemo(() => new THREE.Vector3(), [])
  const rightVec = useMemo(() => new THREE.Vector3(), [])
  const acceleration = useMemo(() => new THREE.Vector3(), [])
  const worldUp = useMemo(() => new THREE.Vector3(0, 1, 0), [])
  const lookEuler = useMemo(() => new THREE.Euler(0, 0, 0, 'YXZ'), [])

  /* --------------------------------------------------------------- input */

  useEffect(() => {
    if (!enabled) return
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        onExit()
        return
      }
      keys.current[e.code] = true
      // Stop the page scrolling underneath the flythrough.
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault()
      }
    }
    const up = (e: KeyboardEvent) => {
      keys.current[e.code] = false
    }
    window.addEventListener('keydown', down, { passive: false })
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      keys.current = {}
    }
  }, [enabled, onExit])

  /* ---------------------------------------------------------- mouse look */

  useEffect(() => {
    if (!enabled) {
      onMouseLookActive(false)
      return
    }

    const canvas = gl.domElement
    let fallbackActive = false
    let fallbackTimer = 0

    const activateFallback = () => {
      if (document.pointerLockElement) return
      fallbackActive = true
      onMouseLookActive(true)
    }

    const onClick = () => {
      if (document.pointerLockElement === canvas) return
      fallbackActive = false

      try {
        const request = canvas.requestPointerLock?.()
        if (request && typeof request.catch === 'function') request.catch(activateFallback)
        window.clearTimeout(fallbackTimer)
        // Embedded browsers can expose the API but silently decline the lock.
        // In that case, retain the same click-to-look interaction without
        // trapping the cursor at the edge of the host viewport.
        fallbackTimer = window.setTimeout(() => {
          if (document.pointerLockElement !== canvas) activateFallback()
        }, 120)
      } catch {
        activateFallback()
      }
    }

    const onLockChange = () => {
      const locked = document.pointerLockElement === canvas
      if (locked) fallbackActive = false
      onMouseLookActive(locked || fallbackActive)
    }

    const onLockError = () => activateFallback()

    const onMouseMove = (event: MouseEvent) => {
      const locked = document.pointerLockElement === canvas
      if (!locked && !fallbackActive) return

      lookEuler.setFromQuaternion(camera.quaternion)
      lookEuler.y -= event.movementX * 0.002
      lookEuler.x -= event.movementY * 0.002
      lookEuler.x = THREE.MathUtils.clamp(lookEuler.x, -Math.PI / 2, Math.PI / 2)
      camera.quaternion.setFromEuler(lookEuler)
    }

    canvas.addEventListener('click', onClick)
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('pointerlockchange', onLockChange)
    document.addEventListener('pointerlockerror', onLockError)

    return () => {
      window.clearTimeout(fallbackTimer)
      canvas.removeEventListener('click', onClick)
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('pointerlockchange', onLockChange)
      document.removeEventListener('pointerlockerror', onLockError)
      if (document.pointerLockElement === canvas) document.exitPointerLock()
      onMouseLookActive(false)
    }
  }, [enabled, camera, gl, lookEuler, onMouseLookActive])

  /* ---------------------------------------------------------------- entry */

  useEffect(() => {
    if (!enabled) {
      smoothedY.current = null
      velocity.current.set(0, 0, 0)
      return
    }
    const pose = flythroughStartPose(terrain, exaggeration)
    // Only snap if the camera transition has not already delivered us here.
    if (camera.position.distanceTo(pose.position) > 0.02) {
      camera.position.copy(pose.position)
      camera.lookAt(pose.look)
    }
    smoothedY.current = camera.position.y
  }, [enabled, camera, terrain, exaggeration])

  /* ----------------------------------------------------------------- loop */

  useFrame((_, delta) => {
    if (!enabled) return
    const dt = Math.min(delta, 0.05)

    const k = keys.current
    const m = moveRef.current
    const forwardInput =
      (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0) + m.forward
    const rightInput = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0) + m.right
    const upInput = (k.Space ? 1 : 0) - (k.KeyC || k.ShiftLeft ? 1 : 0) + m.up
    const boost = Boolean(k.ShiftRight) || m.boost

    // Ground-plane basis derived from where the camera is looking.
    camera.getWorldDirection(forwardVec)
    forwardVec.y = 0
    if (forwardVec.lengthSq() < 1e-6) forwardVec.set(0, 0, -1)
    forwardVec.normalize()
    rightVec.crossVectors(forwardVec, worldUp).normalize()

    const speedWorld = (BASE_SPEED_M / terrain.extentMeters) * (boost ? 2.6 : 1)
    // Reused every frame. Creating a Vector3 at display refresh rate produces
    // avoidable garbage during a long flythrough without improving movement.
    const accel = acceleration
      .set(0, 0, 0)
      .addScaledVector(forwardVec, forwardInput)
      .addScaledVector(rightVec, rightInput)
    if (accel.lengthSq() > 1) accel.normalize()
    accel.multiplyScalar(speedWorld)
    accel.y = upInput * speedWorld * 0.55

    // Critically-damped-ish approach to the target velocity.
    velocity.current.lerp(accel, Math.min(1, dt * 7))
    camera.position.addScaledVector(velocity.current, dt)

    // Stay inside the footprint.
    camera.position.x = THREE.MathUtils.clamp(camera.position.x, -0.495, 0.495)
    camera.position.z = THREE.MathUtils.clamp(camera.position.z, -0.495, 0.495)

    // Terrain following: never clip through the surface, but allow climbing.
    const ground = surfaceY(camera.position.x, camera.position.z, terrain, exaggeration)
    const minY = ground + (12 / terrain.extentMeters) * exaggeration
    const restY = ground + (EYE_HEIGHT_M / terrain.extentMeters) * exaggeration

    if (smoothedY.current === null) smoothedY.current = camera.position.y
    if (upInput === 0) {
      // Settle toward a comfortable altitude above ground.
      smoothedY.current = THREE.MathUtils.lerp(camera.position.y, restY, Math.min(1, dt * 1.7))
      camera.position.y = smoothedY.current
    } else {
      smoothedY.current = camera.position.y
    }
    if (camera.position.y < minY) {
      camera.position.y = minY
      smoothedY.current = minY
      velocity.current.y = Math.max(0, velocity.current.y)
    }

    /* ------------------------------------------------------------ readout */

    readoutClock.current += dt
    if (readoutClock.current > 0.1) {
      readoutClock.current = 0
      const [u, v] = worldToUv(camera.position.x, camera.position.z)
      const groundElev = sampleGrid(terrain.heights, terrain.size, u, v)
      const slope = slopeDegAt(terrain.heights, terrain.size, u, v, terrain.extentMeters)
      const [lon, lat] = uvToLonLat(terrain.bounds, u, v)

      // Convert the camera's world-space height back into metres.
      const cameraElev =
        terrain.minElevation + (camera.position.y / exaggeration) * terrain.extentMeters

      const heading = (THREE.MathUtils.radToDeg(Math.atan2(forwardVec.x, -forwardVec.z)) + 360) % 360

      onReadout({
        altitude: cameraElev,
        agl: Math.max(0, cameraElev - groundElev),
        slope,
        heading,
        lon,
        lat,
        speed: velocity.current.length() * terrain.extentMeters,
      })
    }
  })

  return null
}
