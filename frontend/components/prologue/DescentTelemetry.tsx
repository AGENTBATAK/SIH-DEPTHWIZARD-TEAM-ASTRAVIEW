import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import {
  altitudeAt,
  formatAltitude,
  SCENE_CENTER,
  SCENE_EXTENT_M,
  clamp01,
} from './descent'
import { stage } from './stageState'
import { fmtLat, fmtLon } from '../../lib/format'

/**
 * The descent instrument readout.
 *
 * Every figure here is the scene's own: the coordinates are the demo terrain's
 * real centre from `lib/terrain.ts`, and the extent is its real footprint. The
 * altitude is the only invented number, and it is the one thing on screen that
 * is explicitly a camera position rather than a measurement — so it carries no
 * provenance tag, because it is not a claim about the world.
 *
 * Written directly to the DOM from a GSAP ticker rather than through React
 * state. At sixty frames a second, re-rendering four `<span>`s through the
 * reconciler is pure waste, and the repo already takes this approach wherever
 * scroll drives a value.
 */
export function DescentTelemetry() {
  const altRef = useRef<HTMLSpanElement>(null)
  const latRef = useRef<HTMLSpanElement>(null)
  const lonRef = useRef<HTMLSpanElement>(null)
  const extentRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const tick = () => {
      const d = clamp01(stage.descent)
      // Same aspect the camera uses, because below nadir the altitude *is* the
      // camera height and that height is chosen from the aspect ratio.
      const alt = altitudeAt(d, window.innerWidth / window.innerHeight)

      if (altRef.current) altRef.current.textContent = formatAltitude(alt)

      // Coordinates resolve as the target becomes a place rather than a region.
      // Showing six decimals from orbit would claim a precision the framing does
      // not have.
      const precision = d < 0.25 ? 1 : d < 0.55 ? 2 : 4
      if (latRef.current) latRef.current.textContent = fmtLat(SCENE_CENTER[1], precision)
      if (lonRef.current) lonRef.current.textContent = fmtLon(SCENE_CENTER[0], precision)

      // The footprint is meaningless until the scene is actually in frame.
      if (extentRef.current) {
        extentRef.current.textContent = d < 0.6 ? '—' : `${SCENE_EXTENT_M} m`
      }
    }

    tick()
    gsap.ticker.add(tick)
    return () => gsap.ticker.remove(tick)
  }, [])

  return (
    <div className="dw-shell dw-shell-sm w-[13.5rem]">
      <div className="dw-core dw-core-sm grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 px-4 py-3">
        <span className="dw-label">ALT</span>
        <span ref={altRef} className="dw-value text-right text-[11px] text-ink">
          408 km
        </span>

        <span className="dw-label">LAT</span>
        <span ref={latRef} className="dw-value text-right text-[11px] text-ink-dim">
          —
        </span>

        <span className="dw-label">LON</span>
        <span ref={lonRef} className="dw-value text-right text-[11px] text-ink-dim">
          —
        </span>

        <span className="dw-label">EXTENT</span>
        <span ref={extentRef} className="dw-value text-right text-[11px] text-ink-dim">
          —
        </span>
      </div>
    </div>
  )
}
