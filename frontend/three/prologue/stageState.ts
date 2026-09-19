/**
 * Scroll state shared between the prologue DOM and the WebGL stage.
 *
 * Plain mutable objects rather than zustand or context, for exactly the reason
 * `Hero` already threads a `riseRef` down into `HeroTerrain`: these values
 * change on every scroll frame, and routing them through React state would
 * re-render the tree sixty times a second to move one float. ScrollTrigger
 * writes them, `useFrame` reads them, React never learns they changed.
 *
 * `prologueActive` is different — it changes rarely and genuinely needs to
 * re-render, so it goes through a subscription instead.
 */

/** Prologue scroll progress, 0 at the top of the atmosphere, 1 on arrival. */
export const stage = { descent: 0 }

/**
 * Terrain assembly progress, 0..1.
 *
 * Two things can drive this and only one may be in charge at a time: the
 * descent owns it when a prologue is mounted, and the hero's boot timeline owns
 * it when one is not. Without a single shared ref they fight, and the terrain
 * either double-animates or never rises at all.
 */
export const riseRef = { current: 0 }

let prologueActive = false
const listeners = new Set<() => void>()

export function setPrologueActive(active: boolean) {
  if (prologueActive === active) return
  prologueActive = active
  for (const fn of listeners) fn()
}

export function isPrologueActive() {
  return prologueActive
}

export function subscribeStage(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** Reset so a client-side route change never inherits stale scroll. */
export function resetStage() {
  stage.descent = 0
  riseRef.current = 0
}
