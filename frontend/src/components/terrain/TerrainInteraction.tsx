import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import { Html, Line } from '@react-three/drei'
import type { Measurement, TerrainData } from '../../types'
import { raycastTerrain, type TerrainHit } from '../../lib/raycast'
import { fmt } from '../../lib/format'

/**
 * Pointer picking against the terrain.
 *
 * Handlers live on the canvas element rather than on a mesh so a ray that
 * enters the terrain volume anywhere is picked up, including views where the
 * flat base plane is off screen behind a ridge. Moves are coalesced to one
 * ray-march per animation frame; without that, a high-polling-rate mouse fires
 * several hundred marches a second for no visible benefit.
 */
export function TerrainInteraction({
  terrain,
  exaggeration,
  enabled,
  onHover,
  onPick,
}: {
  terrain: TerrainData
  exaggeration: number
  enabled: boolean
  onHover: (hit: TerrainHit | null) => void
  onPick?: (hit: TerrainHit) => void
}) {
  const { gl, camera } = useThree()
  const pending = useRef<{ x: number; y: number } | null>(null)
  const raf = useRef(0)
  const downAt = useRef<{ x: number; y: number; t: number } | null>(null)
  const ndc = useMemo(() => new THREE.Vector2(), [])
  const raycaster = useMemo(() => new THREE.Raycaster(), [])

  useEffect(() => {
    if (!enabled) {
      onHover(null)
      return
    }
    const el = gl.domElement

    const toNdc = (clientX: number, clientY: number) => {
      const r = el.getBoundingClientRect()
      return ndc.set(
        ((clientX - r.left) / r.width) * 2 - 1,
        -((clientY - r.top) / r.height) * 2 + 1,
      )
    }

    const march = (clientX: number, clientY: number): TerrainHit | null => {
      raycaster.setFromCamera(toNdc(clientX, clientY), camera)
      return raycastTerrain(raycaster.ray, terrain, exaggeration)
    }

    const flush = () => {
      raf.current = 0
      const p = pending.current
      if (!p) return
      onHover(march(p.x, p.y))
    }

    const onMove = (e: PointerEvent) => {
      pending.current = { x: e.clientX, y: e.clientY }
      if (!raf.current) raf.current = requestAnimationFrame(flush)
    }

    const onLeave = () => {
      pending.current = null
      onHover(null)
    }

    const onDown = (e: PointerEvent) => {
      downAt.current = { x: e.clientX, y: e.clientY, t: performance.now() }
    }

    const onUp = (e: PointerEvent) => {
      const d = downAt.current
      downAt.current = null
      if (!d || !onPick) return
      // Distinguish a pick from the end of an orbit drag.
      const moved = Math.hypot(e.clientX - d.x, e.clientY - d.y)
      if (moved > 5 || performance.now() - d.t > 600) return
      const hit = march(e.clientX, e.clientY)
      if (hit) onPick(hit)
    }

    el.addEventListener('pointermove', onMove, { passive: true })
    el.addEventListener('pointerleave', onLeave)
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointerup', onUp)

    return () => {
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerleave', onLeave)
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointerup', onUp)
      if (raf.current) cancelAnimationFrame(raf.current)
      raf.current = 0
    }
  }, [enabled, gl, camera, terrain, exaggeration, onHover, onPick, ndc, raycaster])

  return null
}

/* ----------------------------------------------------------- measurements */

export function MeasurementLayer({
  measurements,
  pending,
  cursor,
}: {
  measurements: Measurement[]
  pending: { x: number; y: number; z: number } | null
  cursor: THREE.Vector3 | null
}) {
  return (
    <group>
      {measurements.map((m) => {
        const a = new THREE.Vector3(m.a.x, m.a.y, m.a.z)
        const b = new THREE.Vector3(m.b.x, m.b.y, m.b.z)
        const mid = a.clone().add(b).multiplyScalar(0.5)
        // Elbow showing the horizontal run and the vertical rise separately.
        const corner = new THREE.Vector3(b.x, a.y, b.z)
        return (
          <group key={m.id}>
            <Line points={[a, b]} color="#2fe3ff" lineWidth={1.6} />
            <Line
              points={[a, corner, b]}
              color="#2fe3ff"
              lineWidth={1}
              dashed
              dashSize={0.012}
              gapSize={0.008}
              transparent
              opacity={0.45}
            />
            <Endpoint position={a} />
            <Endpoint position={b} />
            <Html position={mid} center distanceFactor={1.1} zIndexRange={[30, 0]}>
              <div className="pointer-events-none -translate-y-6 whitespace-nowrap border border-cyan-core/40 bg-void/85 px-2 py-1.5 backdrop-blur">
                <div className="dw-value text-[8px] leading-tight text-cyan-core">
                  {fmt(m.distance.value, 1)} m
                </div>
                <div className="dw-value text-[8px] leading-tight text-ink-dim">
                  Δ {fmt(m.deltaElevation.value, 1)} m · {fmt(m.slope.value, 1)}°
                </div>
              </div>
            </Html>
          </group>
        )
      })}

      {pending && (
        <>
          <Endpoint position={new THREE.Vector3(pending.x, pending.y, pending.z)} pulsing />
          {cursor && (
            <Line
              points={[new THREE.Vector3(pending.x, pending.y, pending.z), cursor]}
              color="#2fe3ff"
              lineWidth={1}
              dashed
              dashSize={0.01}
              gapSize={0.008}
              transparent
              opacity={0.6}
            />
          )}
        </>
      )}
    </group>
  )
}

function Endpoint({ position, pulsing }: { position: THREE.Vector3; pulsing?: boolean }) {
  return (
    <group position={position}>
      <mesh>
        <sphereGeometry args={[0.004, 12, 12]} />
        <meshBasicMaterial color="#2fe3ff" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.008, 0.0095, 24]} />
        <meshBasicMaterial color="#2fe3ff" transparent opacity={pulsing ? 0.9 : 0.5} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

/** Reticle that rides the surface under the pointer. */
export function CursorReticle({ position }: { position: THREE.Vector3 | null }) {
  if (!position) return null
  return (
    <group position={position}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.006, 0.007, 32]} />
        <meshBasicMaterial color="#2fe3ff" transparent opacity={0.75} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.02, 0]}>
        <boxGeometry args={[0.0004, 0.04, 0.0004]} />
        <meshBasicMaterial color="#2fe3ff" transparent opacity={0.35} />
      </mesh>
    </group>
  )
}
