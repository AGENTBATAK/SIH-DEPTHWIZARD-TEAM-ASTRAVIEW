import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { StageCanvas } from './StageCanvas'
import { ScrollTrigger, useReducedMotion } from '../../hooks/useSmoothScroll'

/**
 * The stage's placement in the page.
 *
 * Sticky rather than fixed, so the terrain belongs to the prologue and the hero
 * and to nothing below them. A fixed canvas stays nailed to the viewport while
 * the next section scrolls over it, which makes that section's opaque top edge
 * read as a panel sliding across a frozen terrain rather than as the page
 * moving.
 *
 * Sticky alone is not quite enough. When the wrapper ends the canvas unsticks
 * and scrolls away as a rectangle — and a 3D scene sliding upward shows you its
 * own edges and the black around them, which says "this was a small object on a
 * page" immediately after the descent spent 320vh saying "this is a place". So
 * the stage also fades as the hero leaves. Dissolving keeps the illusion for
 * exactly as long as it is useful and ends it deliberately, rather than by
 * revealing the trick.
 */
export function StageLayer({ heroSelector = '#hero' }: { heroSelector?: string }) {
  const ref = useRef<HTMLDivElement | null>(null)
  const reduced = useReducedMotion()
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const targets = ['#prologue', heroSelector]
      .map((selector) => document.querySelector(selector))
      .filter((element): element is Element => Boolean(element))
    if (!targets.length) return
    const states = new Map<Element, boolean>()
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) states.set(entry.target, entry.isIntersecting)
      setVisible([...states.values()].some(Boolean))
    }, { rootMargin: '200px 0px' })
    targets.forEach((target) => observer.observe(target))
    return () => observer.disconnect()
  }, [heroSelector])

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return

    // Reduced motion never scrolls through a cinematic, so there is no illusion
    // to protect — leave the stage alone rather than fading it on scroll.
    if (reduced) {
      el.style.opacity = '1'
      return
    }

    const hero = document.querySelector(heroSelector)
    if (!hero) return

    const trigger = ScrollTrigger.create({
      trigger: hero,
      // From the hero filling the frame to the hero being half gone. The fade
      // finishes before the wrapper unsticks, so the canvas is already
      // invisible by the time it would otherwise start sliding.
      start: 'bottom bottom',
      end: 'bottom center',
      scrub: true,
      onUpdate: (self) => {
        el.style.opacity = String(1 - self.progress)
      },
    })

    return () => trigger.kill()
  }, [heroSelector, reduced])

  return (
    <div ref={ref} aria-hidden className="pointer-events-none sticky top-0 z-0 h-0">
      <div className="h-[100dvh] w-full">
        {visible ? <StageCanvas /> : <div className="dw-grid-bg size-full opacity-20" />}
      </div>
    </div>
  )
}
