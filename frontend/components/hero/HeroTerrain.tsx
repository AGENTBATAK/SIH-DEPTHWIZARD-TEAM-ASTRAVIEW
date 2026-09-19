import { Suspense, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import type { TerrainData } from '../../types'
import { TerrainSurface, Particles } from '../terrain/TerrainSurface'
import { elevationToWorldY, uvToWorld } from '../../lib/raycast'
import { sampleGrid, uvToLonLat } from '../../lib/terrain'
import { fmtLat, fmtLon } from '../../lib/format'

/**
 * The hero scene.
 *
 * Not a background image and not a decorative object: it is the same terrain
 * component the explorer uses, rendered with the same shader, driven by the
 * same data. The first thing on the page is the product.
 *
 * This module owns the scene *contents* only. The canvas, the camera and the
 * WebGL fallback belong to `terrain/StageCanvas`, because the same canvas has
 * to carry the space prologue and the hero without a cut between them — two
 * canvases cannot share a camera, and the handoff is the whole point.
 */

export const EXAGGERATION = 2.1

/**
 * A floating annotation pinned to a point on the surface.
 *
 * The camera orbits, so a marker that is comfortably inside the frame at one
 * moment can be half off the right edge a few seconds later. Each frame the
 * anchor is projected to NDC and the label is hidden once it drifts toward an
 * edge — cheaper and more reliable than trying to pick positions that happen to
 * work for every phase of the orbit.
 */
function CoordinateMarker({
  terrain,
  u,
  v,
  label,
  opacityRef,
  riseRef,
}: {
  terrain: TerrainData
  u: number
  v: number
  label: string
  opacityRef: React.RefObject<number>
  riseRef: { current: number }
}) {
  const [x, z] = uvToWorld(u, v)
  const elev = sampleGrid(terrain.heights, terrain.size, u, v)
  const y = elevationToWorldY(elev, terrain, EXAGGERATION)
  const [lon, lat] = uvToLonLat(terrain.bounds, u, v)

  const [onScreen, setOnScreen] = useState(true)
  const groupRef = useRef<THREE.Group>(null)
  const anchor = useMemo(() => new THREE.Vector3(x, y + 0.1, z), [x, y, z])
  const projected = useMemo(() => new THREE.Vector3(), [])

  useFrame(({ camera }) => {
    // Hidden as a whole, not just the label. Two separate things would give
    // these away: while the terrain is still transparent the meshes are not, so
    // a stalk would hang in the sky over the planet; and while it is opaque but
    // still flat, an elevation annotation is pointing at relief that has not
    // happened yet. They belong with the relief, so they wait for it.
    const settled = (opacityRef.current ?? 0) > 0.85 && riseRef.current > 0.92
    if (groupRef.current) groupRef.current.visible = settled

    projected.copy(anchor).project(camera)
    const visible =
      settled &&
      projected.z < 1 &&
      Math.abs(projected.x) < 0.66 &&
      Math.abs(projected.y) < 0.78
    setOnScreen((prev) => (prev === visible ? prev : visible))
  })

  return (
    <group ref={groupRef} position={[x, y, z]} visible={false}>
      <mesh>
        <sphereGeometry args={[0.0035, 8, 8]} />
        <meshBasicMaterial color="#2fe3ff" />
      </mesh>
      <mesh position={[0, 0.045, 0]}>
        <boxGeometry args={[0.0006, 0.09, 0.0006]} />
        <meshBasicMaterial color="#2fe3ff" transparent opacity={0.35} />
      </mesh>
      <Html
        position={[0, 0.1, 0]}
        center
        distanceFactor={1.4}
        zIndexRange={[20, 0]}
        style={{
          pointerEvents: 'none',
          opacity: onScreen ? 1 : 0,
          transition: 'opacity 320ms ease',
        }}
      >
        <div className="whitespace-nowrap rounded-xl border border-cyan-core/25 bg-void/70 px-2.5 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-sm">
          <div className="dw-label !text-[7px] text-cyan-core">{label}</div>
          <div className="dw-value mt-1 text-[7px] leading-tight text-ink-dim">
            {fmtLat(lat, 3)} · {fmtLon(lon, 3)}
          </div>
          <div className="dw-value text-[7px] leading-tight text-ink-faint">
            {elev.toFixed(0)} m
          </div>
        </div>
      </Html>
    </group>
  )
}

/**
 * Terrain, markers and atmosphere — everything below the camera.
 *
 * `opacityRef` is read per frame rather than passed as a prop so the descent
 * can fade the surface in without re-rendering this subtree.
 */
export function HeroTerrainContent({
  terrain,
  textureUrl,
  riseRef,
  opacityRef,
  animate,
  riseDrivesOpacity = true,
}: {
  terrain: TerrainData
  textureUrl: string
  riseRef: { current: number }
  opacityRef: React.RefObject<number>
  animate: boolean
  riseDrivesOpacity?: boolean
}) {
  return (
    <Suspense fallback={null}>
      <TerrainSurface
        terrain={terrain}
        textureUrl={textureUrl}
        ramp="hypsometric"
        exaggeration={EXAGGERATION}
        riseRef={riseRef}
        opacityRef={opacityRef}
        riseDrivesOpacity={riseDrivesOpacity}
        scanline={animate}
        fogNear={0.85}
        fogFar={2.6}
        layers={{
          texture: true,
          elevation: true,
          contours: true,
          wireframe: true,
          referenceDem: false,
          grid: true,
          structures: true,
        }}
      />
      {/* Both markers sit east of centre so their labels never land on the
          headline, whatever phase the slow orbit is in. */}
      <CoordinateMarker
        terrain={terrain}
        u={0.62}
        v={0.3}
        label="RIDGE NODE"
        opacityRef={opacityRef}
        riseRef={riseRef}
      />
      <CoordinateMarker
        terrain={terrain}
        u={0.54}
        v={0.72}
        label="VALLEY FLOOR"
        opacityRef={opacityRef}
        riseRef={riseRef}
      />

      {animate && <Particles count={220} spread={2.0} />}
    </Suspense>
  )
}
