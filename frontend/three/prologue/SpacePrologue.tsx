import { useLayoutEffect, useRef } from 'react'
import { gsap, ScrollTrigger, useReducedMotion } from '../../hooks/useSmoothScroll'
import { DescentTelemetry } from './DescentTelemetry'
import { BEATS, beatOpacityAt, clamp01, descentStateAt, ramp } from './descent'
import { resetStage, setPrologueActive, stage } from './stageState'

/**
 * The space-to-terrain prologue.
 *
 * This component renders almost nothing: a tall scroll track, a telemetry
 * block, three lines of text. The cinematic itself happens on the shared
 * `StageCanvas` behind it. All this section does is convert scroll position
 * into one number — `stage.descent` — and let the stage read it.
 *
 * That split is deliberate. The camera move, the globe, the atmosphere and the
 * terrain assembly are all pure functions of that number (see `descent.ts`), so
 * scrubbing backwards retraces the flight exactly and there is no animation
 * state anywhere that can fall out of sync with the scrollbar.
 *
 * Reduced motion removes the section outright rather than shortening it: a
 * 320vh scroll track whose only purpose is to animate is not something to make
 * a motion-sensitive visitor scroll through.
 */

/** Scroll distance the descent occupies. Long enough to feel like a descent. */
const TRACK_VH = 320

export function SpacePrologue() {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const frameRef = useRef<HTMLDivElement | null>(null)
  const hazeRef = useRef<HTMLDivElement | null>(null)
  const reduced = useReducedMotion()

  useLayoutEffect(() => {
    if (reduced) {
      // No prologue: the hero owns its own boot animation again, and the
      // terrain must start fully assembled rather than waiting for a descent
      // that will never run.
      setPrologueActive(false)
      stage.descent = 1
      return
    }

    setPrologueActive(true)
    stage.descent = 0

    const beats = gsap.utils.toArray<HTMLElement>('[data-beat]')

    const trigger = ScrollTrigger.create({
      trigger: rootRef.current,
      start: 'top top',
      end: 'bottom bottom',
      scrub: true,
      onUpdate: (self) => {
        const d = clamp01(self.progress)
        stage.descent = d

        // The cloud the descent passes through. Driven from the same curve as
        // everything else, so it is guaranteed to be covering the frame at the
        // exact moment the globe and the terrain trade places underneath it.
        if (hazeRef.current) {
          hazeRef.current.style.opacity = String(descentStateAt(d).haze)
        }

        // The prologue's own treatment — scrims, telemetry, beats — has to be
        // gone before the section scrolls away. Its sticky frame stops sticking
        // at the end of the track, and anything still painted on it would drag
        // a hard horizontal edge up across the terrain: exactly the cut the
        // shared canvas exists to avoid.
        if (frameRef.current) {
          frameRef.current.style.opacity = String(1 - ramp(d, 0.88, 0.99))
        }

        // Beats are driven from the same progress value as the camera, so a
        // line can never appear over the wrong part of the flight.
        for (const el of beats) {
          const id = el.dataset.beat
          const beat = BEATS.find((b) => b.id === id)
          if (!beat) continue
          const o = beatOpacityAt(beat, d)
          el.style.opacity = String(o)
          // A little travel, tied to the same curve. Enough to feel alive,
          // not enough to read as a slide-in.
          el.style.transform = `translate3d(0, ${(1 - o) * 14}px, 0)`
        }
      },
    })

    return () => {
      trigger.kill()
      setPrologueActive(false)
      resetStage()
    }
  }, [reduced])

  if (reduced) return null

  return (
    <section
      id="prologue"
      ref={rootRef}
      aria-label="Descent from orbit to the demo scene"
      style={{ height: `${TRACK_VH}vh` }}
      className="relative w-full"
    >
      {/* The viewport-sized frame that holds still while the track scrolls. */}
      <div
        ref={frameRef}
        className="pointer-events-none sticky top-0 flex h-[100dvh] w-full items-center overflow-hidden"
      >
        {/* The cloud pass. A wash rather than a texture: at this scale real
            cloud geometry would need volumetrics to look like anything, and a
            flat plate would read as a grey rectangle fading in. The warm-cool
            gradient and the grain keep it in the project's palette instead of
            going to hospital white. */}
        <div
          ref={hazeRef}
          aria-hidden
          style={{ opacity: 0 }}
          className="pointer-events-none absolute inset-0 z-[1] bg-[radial-gradient(120%_90%_at_50%_58%,rgba(214,230,243,0.97)_0%,rgba(176,201,222,0.93)_38%,rgba(120,148,172,0.86)_68%,rgba(63,82,101,0.82)_100%)]"
        />

        {/* Legibility scrims. Mid-descent the globe fills the frame and is far
            brighter than anything in the palette, so text placed over it has to
            carry its own contrast rather than trust the background. Gradients
            rather than panels, so they never read as boxes over the art. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] h-[46vh] bg-[linear-gradient(to_top,rgba(4,5,7,0.92)_0%,rgba(4,5,7,0.72)_38%,transparent_100%)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 z-[2] h-[34vh] bg-[linear-gradient(to_bottom,rgba(4,5,7,0.88)_0%,rgba(4,5,7,0.45)_52%,transparent_100%)]"
        />

        <div className="relative z-[3] mx-auto flex h-full w-full max-w-[1680px] flex-col justify-between px-4 pb-16 pt-28 sm:px-10 lg:px-16">
          {/* ------------------------------------------------------ top row */}
          <div className="flex items-start justify-between gap-6">
            <DescentTelemetry />

            {/* The Blue Marble plate is NASA's, not ours. The project's whole
                argument is that it never presents something as more than it
                is, and a photoreal Earth is exactly the kind of image that
                would otherwise read as our own output. */}
            <div className="hidden text-right sm:block">
              <div className="dw-label">REFERENCE IMAGERY</div>
              <div className="dw-value mt-1.5 text-[10px] leading-relaxed text-ink-dim">
                NASA · BLUE MARBLE
                <br />
                PUBLIC DOMAIN
              </div>
            </div>
          </div>

          {/* -------------------------------------------------------- beats */}
          <div className="relative h-32 max-w-2xl">
            {BEATS.map((beat) => (
              <p
                key={beat.id}
                data-beat={beat.id}
                style={{ opacity: 0 }}
                className="absolute inset-x-0 bottom-0 font-display text-[clamp(1.35rem,3.2vw,2.6rem)] font-medium leading-[1.15] tracking-[-0.03em] text-ink"
              >
                {beat.text}
              </p>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
