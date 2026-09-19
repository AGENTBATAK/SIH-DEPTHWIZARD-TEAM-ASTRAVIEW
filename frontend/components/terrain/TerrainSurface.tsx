import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useLoader, useThree } from '@react-three/fiber'
import type { TerrainData } from '../../types'
import type { RampName } from '../../lib/colormaps'
import type { LayerState } from '../../hooks/useScene'
import {
  contourIntervalFor,
  createHeightTexture,
  createLutTexture,
  createTerrainMaterial,
} from './terrainMaterial'
import { elevationToWorldY, uvToWorld } from '../../lib/raycast'

/**
 * The terrain surface itself.
 *
 * Two meshes share one height texture: the shaded surface, and a quarter-
 * resolution wireframe overlay. Rendering the wireframe from the full grid
 * would mean hundreds of thousands of line segments for a decorative layer; at
 * 64² it reads identically and costs almost nothing.
 *
 * The shaded mesh is tessellated adaptively. Because displacement happens in
 * the vertex shader from a texture, changing tessellation is a geometry pointer
 * swap — the height data, the material, the uniforms and the picking code are
 * all untouched, so nothing about the surface changes except how finely it is
 * sampled. That is what makes a 1024² height field affordable: the prologue
 * sees the terrain from orbit at 95², and only the near view pays for 511².
 */

/**
 * Tessellation levels, coarsest first.
 *
 * These are segment counts, so the vertex count is (n+1)², and the sequence
 * quarters vertex count at each step down. 511 is the top for this presentation
 * build: the height texture preserves the full 1024² signal while the mesh cap
 * keeps the live explorer smooth on judge laptops and integrated GPUs.
 */
// 511² is visually indistinguishable at the presentation camera distances but
// avoids a million-vertex draw on judge laptops and integrated GPUs.
const LOD_SEGMENTS = [95, 191, 383, 511] as const

/**
 * Camera distances at which the level steps down, finest boundary first. The
 * terrain is a 1×1 plane, so these are multiples of its own width: the hero
 * orbits at ~1.1 and therefore always gets the top level, and the nadir handoff
 * at ~0.96 does too — which is exactly where the surface is most magnified.
 */
const LOD_STEPS = [1.25, 2.2, 3.8] as const

/** Slack around each threshold, so a drifting camera cannot thrash between levels. */
const LOD_HYSTERESIS = 0.12

/**
 * Pick a tessellation level for a camera distance.
 *
 * `current` biases the decision: a level already in use holds on past its
 * nominal threshold, which is what stops the slow hero orbit from flipping
 * levels every few seconds as it breathes across a boundary.
 */
function lodFor(distance: number, current: number, levels: number): number {
  const slack = 1 + LOD_HYSTERESIS
  for (let i = 0; i < LOD_STEPS.length; i++) {
    // Finest level first: index counts down from the top of LOD_SEGMENTS.
    const index = Math.min(levels - 1, LOD_SEGMENTS.length - 1 - i)
    const threshold = index >= current ? LOD_STEPS[i] * slack : LOD_STEPS[i]
    if (distance < threshold) return index
  }
  return 0
}

export interface TerrainSurfaceProps {
  terrain: TerrainData
  /** Image used for the RGB texture layer. */
  textureUrl: string
  ramp: RampName
  exaggeration: number
  layers: LayerState
  /** 0..1 assembly progress. 1 = fully formed. */
  rise?: number
  /**
   * Per-frame assembly progress. Preferred over `rise` for animated sequences:
   * writing the uniform from a ref inside useFrame avoids re-rendering the React
   * tree sixty times a second just to move one float.
   */
  riseRef?: { current: number }
  /** Normalised cursor position for the on-surface reticle. */
  cursorUv?: [number, number] | null
  scanline?: boolean
  fogNear?: number
  fogFar?: number
  opacity?: number
  /** Per-frame surface opacity. Same rationale as `riseRef`. */
  opacityRef?: React.RefObject<number>
  /**
   * Whether assembly progress also controls opacity.
   *
   * Defaults to true, which is the hero boot behaviour: the surface fades in as
   * it rises. The descent sets it false, because it needs a fully opaque but
   * completely flat surface to exist — that flat plate is the satellite image
   * the relief then lifts out of.
   */
  riseDrivesOpacity?: boolean
}

export function TerrainSurface({
  terrain,
  textureUrl,
  ramp,
  exaggeration,
  layers,
  rise = 1,
  riseRef,
  cursorUv,
  scanline = false,
  fogNear = 1.1,
  fogFar = 3.4,
  opacity = 1,
  opacityRef,
  riseDrivesOpacity = true,
}: TerrainSurfaceProps) {
  const rgbTexture = useLoader(THREE.TextureLoader, textureUrl)
  const { invalidate } = useThree()

  // Height texture is the single source of truth for both meshes.
  const heightTexture = useMemo(
    () =>
      createHeightTexture(
        terrain.heights,
        terrain.size,
        terrain.minElevation,
        terrain.maxElevation,
      ),
    [terrain.heights, terrain.size, terrain.minElevation, terrain.maxElevation],
  )
  const lut = useMemo(() => createLutTexture(ramp), [ramp])

  const surfaceMaterial = useMemo(
    () =>
      createTerrainMaterial({
        size: terrain.size,
        minElevation: terrain.minElevation,
        maxElevation: terrain.maxElevation,
        extentMeters: terrain.extentMeters,
      }),
    [terrain.size, terrain.minElevation, terrain.maxElevation, terrain.extentMeters],
  )

  const wireMaterial = useMemo(
    () =>
      createTerrainMaterial({
        size: terrain.size,
        minElevation: terrain.minElevation,
        maxElevation: terrain.maxElevation,
        extentMeters: terrain.extentMeters,
        wireframe: true,
      }),
    [terrain.size, terrain.minElevation, terrain.maxElevation, terrain.extentMeters],
  )

  // One plane per tessellation level, all built once. A PlaneGeometry is cheap
  // to construct and the whole ladder is a few hundred kilobytes, so paying for
  // it up front is far better than rebuilding geometry mid-orbit.
  const lodGeometries = useMemo(() => {
    const finest = Math.min(terrain.size - 1, LOD_SEGMENTS[LOD_SEGMENTS.length - 1])
    return LOD_SEGMENTS.filter((s, i) => s <= finest || i === 0)
      .map((s) => Math.min(s, finest))
      .map((s) => new THREE.PlaneGeometry(1, 1, s, s))
  }, [terrain.size])

  const surfaceRef = useRef<THREE.Mesh>(null)
  const lodIndex = useRef(lodGeometries.length - 1)

  const wireGeometry = useMemo(() => {
    const segments = Math.min(terrain.size - 1, 255)
    const s = Math.max(24, Math.min(72, Math.round(segments / 4)))
    return new THREE.PlaneGeometry(1, 1, s, s)
  }, [terrain.size])

  /* ------------------------------------------------------------ uniforms */

  useLayoutEffect(() => {
    // The RGB plate and the ramp LUT are authored in display space; sampling
    // them raw keeps what we author identical to what reaches the screen.
    rgbTexture.colorSpace = THREE.NoColorSpace
    rgbTexture.minFilter = THREE.LinearMipmapLinearFilter
    rgbTexture.magFilter = THREE.LinearFilter
    rgbTexture.anisotropy = 4
    rgbTexture.needsUpdate = true
    lut.colorSpace = THREE.NoColorSpace

    for (const m of [surfaceMaterial, wireMaterial]) {
      m.uniforms.uHeightTex.value = heightTexture
      m.uniforms.uRgbTex.value = rgbTexture
      m.uniforms.uLut.value = lut
      m.uniforms.uTexel.value = 1 / terrain.size
      m.uniforms.uHeightRange.value.set(terrain.minElevation, terrain.maxElevation)
      m.uniforms.uYScale.value = 1 / terrain.extentMeters
      m.uniforms.uContourInterval.value = contourIntervalFor(
        terrain.maxElevation - terrain.minElevation,
      )
    }
    invalidate()
  }, [heightTexture, rgbTexture, lut, surfaceMaterial, wireMaterial, terrain, invalidate])

  useLayoutEffect(() => {
    const apply = (m: THREE.ShaderMaterial) => {
      m.uniforms.uExaggeration.value = exaggeration
      m.uniforms.uRise.value = rise
      m.uniforms.uTextureMix.value = layers.texture ? (layers.elevation ? 0.55 : 1) : 0
      m.uniforms.uContour.value = layers.contours ? 1 : 0
      m.uniforms.uGrid.value = layers.grid ? 1 : 0
      m.uniforms.uFogNear.value = fogNear
      m.uniforms.uFogFar.value = fogFar
      m.uniforms.uOpacity.value = opacity
      m.uniforms.uScanline.value = scanline ? 1 : 0
      m.uniforms.uRiseFade.value = riseDrivesOpacity ? 1 : 0
    }
    apply(surfaceMaterial)
    apply(wireMaterial)
    wireMaterial.uniforms.uOpacity.value = opacity
    invalidate()
  }, [
    exaggeration,
    rise,
    layers,
    fogNear,
    fogFar,
    opacity,
    scanline,
    riseDrivesOpacity,
    surfaceMaterial,
    wireMaterial,
    invalidate,
  ])

  useLayoutEffect(() => {
    const [u, v] = cursorUv ?? [-1, -1]
    surfaceMaterial.uniforms.uCursor.value.set(u, v)
    surfaceMaterial.uniforms.uCursorStrength.value = cursorUv ? 1 : 0
    invalidate()
  }, [cursorUv, surfaceMaterial, invalidate])

  useFrame(({ camera }, delta) => {
    surfaceMaterial.uniforms.uTime.value += delta
    wireMaterial.uniforms.uTime.value += delta

    if (riseRef) {
      surfaceMaterial.uniforms.uRise.value = riseRef.current
      wireMaterial.uniforms.uRise.value = riseRef.current
    }

    if (opacityRef) {
      const o = opacityRef.current ?? 1
      surfaceMaterial.uniforms.uOpacity.value = o
      wireMaterial.uniforms.uOpacity.value = o
      // Skipping the surface entirely while it is invisible is what keeps the
      // early prologue cheap — there is no point tessellating a terrain that
      // has not faded in yet.
      if (surfaceRef.current) surfaceRef.current.visible = o > 0.002
    }

    // Adaptive tessellation. Distance is measured to the terrain's centre,
    // which is the origin; using the camera rather than the geometry means the
    // exaggeration slider can never trigger a re-evaluation.
    const distance = camera.position.length()
    const next = lodFor(distance, lodIndex.current, lodGeometries.length)
    if (next !== lodIndex.current) {
      lodIndex.current = next
      if (surfaceRef.current) surfaceRef.current.geometry = lodGeometries[next]
    }
  })

  /* -------------------------------------------------------------- cleanup */

  useEffect(
    () => () => {
      for (const g of lodGeometries) g.dispose()
      wireGeometry.dispose()
      heightTexture.dispose()
      lut.dispose()
      surfaceMaterial.dispose()
      wireMaterial.dispose()
    },
    [lodGeometries, wireGeometry, heightTexture, lut, surfaceMaterial, wireMaterial],
  )

  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      <mesh
        ref={surfaceRef}
        geometry={lodGeometries[lodGeometries.length - 1]}
        material={surfaceMaterial}
        frustumCulled={false}
      />
      {layers.wireframe && (
        <mesh
          geometry={wireGeometry}
          material={wireMaterial}
          frustumCulled={false}
          position={[0, 0, 0.0006]}
        />
      )}
    </group>
  )
}

/* -------------------------------------------------------------- structures */

export function StructureMarkers({
  terrain,
  exaggeration,
  selectedId,
  onSelect,
}: {
  terrain: TerrainData
  exaggeration: number
  selectedId?: string | null
  onSelect?: (id: string) => void
}) {
  const markers = useMemo(
    () =>
      terrain.structures.map((s) => {
        const [x, z] = uvToWorld(s.u, s.v)
        const yTop = elevationToWorldY(s.topElevation.value, terrain, exaggeration)
        const yBase = elevationToWorldY(s.baseElevation.value, terrain, exaggeration)
        return { s, x, z, yTop, yBase }
      }),
    [terrain, exaggeration],
  )

  return (
    <group>
      {markers.map(({ s, x, z, yTop, yBase }) => {
        const selected = selectedId === s.id
        return (
          <group key={s.id} position={[x, 0, z]}>
            {/* Vertical tick from ground to roof — reads the measured height. */}
            <mesh position={[0, (yBase + yTop) / 2, 0]}>
              <boxGeometry args={[0.0012, Math.max(yTop - yBase, 0.0008), 0.0012]} />
              <meshBasicMaterial
                color={selected ? '#2fe3ff' : '#17b3a3'}
                transparent
                opacity={selected ? 0.95 : 0.4}
              />
            </mesh>
            {/* Roof node, also the click target. */}
            <mesh
              position={[0, yTop, 0]}
              onClick={(e) => {
                e.stopPropagation()
                onSelect?.(s.id)
              }}
              onPointerOver={(e) => e.stopPropagation()}
            >
              <sphereGeometry args={[selected ? 0.0055 : 0.0032, 10, 10]} />
              <meshBasicMaterial
                color={selected ? '#2fe3ff' : '#7fe9f5'}
                transparent
                opacity={selected ? 1 : 0.55}
              />
            </mesh>
            {selected && (
              <mesh position={[0, (yBase + yTop) / 2, 0]}>
                <boxGeometry
                  args={[s.fw, Math.max(yTop - yBase, 0.001), s.fd]}
                />
                <meshBasicMaterial color="#2fe3ff" wireframe transparent opacity={0.7} />
              </mesh>
            )}
          </group>
        )
      })}
    </group>
  )
}

/* ------------------------------------------------------------- atmosphere */

/**
 * A soft round sprite. Without it, `pointsMaterial` draws literal squares —
 * which read as rendering artefacts rather than atmosphere.
 */
function makeDotTexture(): THREE.CanvasTexture {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.45, 'rgba(255,255,255,0.55)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.NoColorSpace
  return tex
}

/** Drifting motes. Tiny count, purely atmospheric. */
export function Particles({ count = 260, spread = 2.2 }: { count?: number; spread?: number }) {
  const ref = useRef<THREE.Points>(null)
  const dot = useMemo(makeDotTexture, [])

  const geometry = useMemo(() => {
    const positions = new Float32Array(count * 3)
    const speeds = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * spread
      positions[i * 3 + 1] = Math.random() * 0.55
      positions[i * 3 + 2] = (Math.random() - 0.5) * spread
      speeds[i] = 0.004 + Math.random() * 0.012
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    g.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1))
    return g
  }, [count, spread])

  useFrame((_, delta) => {
    const pos = geometry.getAttribute('position') as THREE.BufferAttribute
    const speeds = geometry.getAttribute('aSpeed') as THREE.BufferAttribute
    for (let i = 0; i < pos.count; i++) {
      let y = pos.getY(i) + speeds.getX(i) * delta * 6
      if (y > 0.6) y = -0.02
      pos.setY(i, y)
    }
    pos.needsUpdate = true
    if (ref.current) ref.current.rotation.y += delta * 0.012
  })

  useEffect(
    () => () => {
      geometry.dispose()
      dot.dispose()
    },
    [geometry, dot],
  )

  return (
    <points ref={ref} geometry={geometry} frustumCulled={false}>
      <pointsMaterial
        size={0.006}
        map={dot}
        color="#4fd8ef"
        transparent
        opacity={0.3}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
}
