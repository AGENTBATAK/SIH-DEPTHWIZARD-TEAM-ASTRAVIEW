import * as THREE from 'three'
import { sampleGrid, slopeDegAt, uvToLonLat } from './terrain'
import type { TerrainData } from '../types'

/**
 * CPU ray-marching against the height field.
 *
 * Displacement happens in the vertex shader, so the geometry three.js would
 * raycast against is a flat plane — picking against it would return the wrong
 * point for any oblique view, and every measurement taken on a slope would be
 * quietly wrong. Marching the actual height field instead keeps picking honest,
 * which matters because these hits become distances and structure heights the
 * interface presents as derived values.
 *
 * The terrain occupies x,z in [-0.5, 0.5] and y = (h - min) * yScale * exaggeration.
 */

export interface TerrainHit {
  /** World-space intersection. */
  point: THREE.Vector3
  u: number
  v: number
  /** Elevation in metres at the hit. */
  elevation: number
  slope: number
  lon: number
  lat: number
}

const HALF = 0.5

export function worldToUv(x: number, z: number): [number, number] {
  // Local +y of the plane maps to world -z after the -90° X rotation, so v runs
  // opposite to world z. Keeping this in one place stops the two conventions
  // drifting apart between picking, the HUD and the map footprint.
  return [x + HALF, HALF - z]
}

export function uvToWorld(u: number, v: number): [number, number] {
  return [u - HALF, HALF - v]
}

export function elevationToWorldY(
  elevation: number,
  terrain: TerrainData,
  exaggeration: number,
): number {
  return ((elevation - terrain.minElevation) / terrain.extentMeters) * exaggeration
}

/** Surface height in world units at a world-space (x, z). */
export function surfaceY(
  x: number,
  z: number,
  terrain: TerrainData,
  exaggeration: number,
): number {
  const [u, v] = worldToUv(x, z)
  const h = sampleGrid(terrain.heights, terrain.size, u, v)
  return elevationToWorldY(h, terrain, exaggeration)
}

function boxInterval(ray: THREE.Ray, maxY: number): [number, number] | null {
  const box = new THREE.Box3(
    new THREE.Vector3(-HALF, -0.05, -HALF),
    new THREE.Vector3(HALF, maxY + 0.05, HALF),
  )
  // Slab method, but we need both entry and exit, which Ray.intersectBox hides.
  const inv = new THREE.Vector3(1 / ray.direction.x, 1 / ray.direction.y, 1 / ray.direction.z)
  let tmin = -Infinity
  let tmax = Infinity
  const o = ray.origin
  const axes: Array<'x' | 'y' | 'z'> = ['x', 'y', 'z']
  for (const a of axes) {
    const t1 = (box.min[a] - o[a]) * inv[a]
    const t2 = (box.max[a] - o[a]) * inv[a]
    tmin = Math.max(tmin, Math.min(t1, t2))
    tmax = Math.min(tmax, Math.max(t1, t2))
  }
  if (tmax < Math.max(tmin, 0)) return null
  return [Math.max(tmin, 0), tmax]
}

/**
 * March the ray in fixed steps until it passes below the surface, then binary
 * search the crossing. 96 steps plus 12 refinements resolves well below one
 * raster cell at typical camera distances and costs microseconds.
 */
export function raycastTerrain(
  ray: THREE.Ray,
  terrain: TerrainData,
  exaggeration: number,
): TerrainHit | null {
  const maxY = elevationToWorldY(terrain.maxElevation, terrain, exaggeration)
  const interval = boxInterval(ray, maxY)
  if (!interval) return null

  const [tStart, tEnd] = interval
  const steps = 96
  const dt = (tEnd - tStart) / steps

  const p = new THREE.Vector3()
  let prevT = tStart
  let prevDiff = 0
  let found = false
  let hitT = tStart

  for (let i = 0; i <= steps; i++) {
    const t = tStart + dt * i
    ray.at(t, p)
    const diff = p.y - surfaceY(p.x, p.z, terrain, exaggeration)
    if (i > 0 && prevDiff > 0 && diff <= 0) {
      // Crossing bracketed between prevT and t.
      let lo = prevT
      let hi = t
      for (let k = 0; k < 12; k++) {
        const mid = (lo + hi) / 2
        ray.at(mid, p)
        if (p.y - surfaceY(p.x, p.z, terrain, exaggeration) > 0) lo = mid
        else hi = mid
      }
      hitT = (lo + hi) / 2
      found = true
      break
    }
    prevT = t
    prevDiff = diff
  }

  if (!found) return null

  ray.at(hitT, p)
  const [u, v] = worldToUv(p.x, p.z)
  if (u < 0 || u > 1 || v < 0 || v > 1) return null

  const elevation = sampleGrid(terrain.heights, terrain.size, u, v)
  const slope = slopeDegAt(terrain.heights, terrain.size, u, v, terrain.extentMeters)
  const [lon, lat] = uvToLonLat(terrain.bounds, u, v)

  return { point: p.clone(), u, v, elevation, slope, lon, lat }
}

/** Build a picking ray from normalised device coordinates. */
export function rayFromNdc(camera: THREE.Camera, ndc: THREE.Vector2): THREE.Ray {
  const raycaster = new THREE.Raycaster()
  raycaster.setFromCamera(ndc, camera)
  return raycaster.ray
}
