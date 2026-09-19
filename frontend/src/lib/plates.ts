/**
 * Raster plate cache.
 *
 * The depth, edge and contour plates each cost a full pass over a 256² grid and
 * a PNG encode. They are deterministic for a given scene, so they are computed
 * once — during boot, where the wait is already accounted for — and reused by
 * every panel that needs them instead of being regenerated on mount.
 */

const cache = new Map<string, string>()
const MAX_ENTRIES = 16

export type PlateKind = 'depth' | 'edge' | 'contour' | 'elevation'

const keyFor = (sceneId: string, kind: PlateKind) => `${sceneId}::${kind}`

export function getPlate(
  sceneId: string,
  kind: PlateKind,
  make: () => HTMLCanvasElement,
): string {
  const key = keyFor(sceneId, kind)
  const hit = cache.get(key)
  if (hit) return hit

  const url = make().toDataURL()
  cache.set(key, url)

  // Data URLs for 256² plates are ~100 KB each; keep the cache bounded so a
  // session that loads many scenes does not accumulate them indefinitely.
  if (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value
    if (oldest) cache.delete(oldest)
  }

  return url
}

export function clearPlates(sceneId?: string) {
  if (!sceneId) {
    cache.clear()
    return
  }
  for (const key of [...cache.keys()]) {
    if (key.startsWith(`${sceneId}::`)) cache.delete(key)
  }
}
