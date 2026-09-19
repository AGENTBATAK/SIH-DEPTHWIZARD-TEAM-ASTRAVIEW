import { useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { useReducedMotion } from '../../hooks/useSmoothScroll'

type CursorMode = 'default' | 'button' | 'crosshair' | 'upload' | 'drag' | 'text'

/**
 * Custom cursor.
 *
 * Rules it follows so it stays useful rather than irritating: it never lags far
 * enough behind to feel disconnected, it never hides the native cursor over
 * text inputs, and it disables itself entirely for touch devices, reduced-motion
 * users, and coarse pointers. Mode comes from a `data-cursor` attribute on the
 * nearest ancestor, so components opt in explicitly.
 */
export function CustomCursor() {
  const dotRef = useRef<HTMLDivElement | null>(null)
  const ringRef = useRef<HTMLDivElement | null>(null)
  const [mode, setMode] = useState<CursorMode>('default')
  const [visible, setVisible] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const visibleRef = useRef(false)
  const modeRef = useRef<CursorMode>('default')
  const reduced = useReducedMotion()

  useEffect(() => {
    const fine = window.matchMedia('(pointer: fine)').matches
    setEnabled(fine && !reduced)
  }, [reduced])

  useEffect(() => {
    if (!enabled) {
      document.documentElement.classList.remove('dw-cursor-hidden')
      return
    }
    document.documentElement.classList.add('dw-cursor-hidden')

    const dotX = gsap.quickTo(dotRef.current, 'x', { duration: 0.09, ease: 'power3.out' })
    const dotY = gsap.quickTo(dotRef.current, 'y', { duration: 0.09, ease: 'power3.out' })
    const ringX = gsap.quickTo(ringRef.current, 'x', { duration: 0.42, ease: 'power3.out' })
    const ringY = gsap.quickTo(ringRef.current, 'y', { duration: 0.42, ease: 'power3.out' })

    const onMove = (e: PointerEvent) => {
      if (!visibleRef.current) {
        visibleRef.current = true
        setVisible(true)
      }
      dotX(e.clientX)
      dotY(e.clientY)
      ringX(e.clientX)
      ringY(e.clientY)

      const target = e.target as HTMLElement | null
      const holder = target?.closest?.('[data-cursor]') as HTMLElement | null
      const next = (holder?.dataset.cursor as CursorMode) ?? 'default'

      const nextMode = target?.closest('input, textarea, select, [contenteditable="true"]')
        ? 'text'
        : next
      if (nextMode !== modeRef.current) {
        modeRef.current = nextMode
        setMode(nextMode)
      }
    }

    const onLeave = () => {
      visibleRef.current = false
      setVisible(false)
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    document.addEventListener('pointerleave', onLeave)
    return () => {
      window.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerleave', onLeave)
      document.documentElement.classList.remove('dw-cursor-hidden')
    }
  }, [enabled])

  if (!enabled) return null

  const isCross = mode === 'crosshair'

  /* The ring box is a constant 52px and the mode change is expressed as a
     scale. Animating width/height instead would relayout a fixed overlay on
     every mode change, which is the one element on the page guaranteed to be
     moving at the time. */
  const RING_BOX = 52
  const ringSize = mode === 'button' ? 44 : mode === 'upload' || mode === 'drag' ? 52 : isCross ? 30 : 26
  const ringScale = ringSize / RING_BOX

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[300]"
      style={{ opacity: visible ? 1 : 0, transition: 'opacity 180ms ease' }}
    >
      {/* Ring / reticle */}
      <div
        ref={ringRef}
        className="absolute left-0 top-0 -translate-x-1/2 -translate-y-1/2"
        style={{ willChange: 'transform' }}
      >
        <div
          className="grid place-items-center border transition-[transform,border-color,background-color,border-radius] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
          style={{
            width: RING_BOX,
            height: RING_BOX,
            transform: `scale(${ringScale})`,
            // Counter-scale the edge so the ring is 1px on screen at every size.
            borderWidth: 1 / ringScale,
            borderRadius: (isCross ? 6 : 999) / ringScale,
            borderColor:
              mode === 'default' ? 'rgba(93,110,133,0.5)' : 'rgba(47,227,255,0.75)',
            backgroundColor:
              mode === 'button' || mode === 'upload' ? 'rgba(47,227,255,0.07)' : 'transparent',
          }}
        >
          {isCross && (
            <>
              <span className="absolute h-px w-3 bg-cyan-core/70" />
              <span className="absolute h-3 w-px bg-cyan-core/70" />
            </>
          )}
          {(mode === 'upload' || mode === 'drag') && (
            <svg viewBox="0 0 24 24" className="size-4 stroke-cyan-core" fill="none" strokeWidth={1.6}>
              <path d="M12 16V4m0 0L7 9m5-5 5 5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2" strokeLinecap="round" />
            </svg>
          )}
        </div>
      </div>

      {/* Dot — hidden in crosshair and upload modes, where the ring carries the meaning. */}
      <div
        ref={dotRef}
        className="absolute left-0 top-0 -translate-x-1/2 -translate-y-1/2"
        style={{ willChange: 'transform' }}
      >
        <div
          className="size-1 rounded-full bg-cyan-core transition-[transform,opacity] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]"
          style={{
            transform: `scale(${mode === 'default' ? 1 : 0})`,
            opacity: mode === 'default' ? 1 : 0,
          }}
        />
      </div>
    </div>
  )
}
