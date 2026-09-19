import { useEffect, useState } from 'react'
import Lenis from 'lenis'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

/**
 * Respect the OS-level motion preference, reactively — users toggle it mid-session.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  })

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return reduced
}

let lenisInstance: Lenis | null = null
export const getLenis = () => lenisInstance

/**
 * Lenis, wired to GSAP's ticker rather than its own RAF loop.
 *
 * This is the specific integration that matters: if Lenis drives its own rAF and
 * ScrollTrigger drives another, scroll-linked animations lag the scroll position
 * by a frame and every pinned section jitters. Driving Lenis from `gsap.ticker`
 * and pushing `ScrollTrigger.update` on Lenis's scroll event puts both on one
 * clock. `lagSmoothing(0)` stops GSAP from silently skipping time after a long
 * frame, which would otherwise desynchronise the two.
 */
export function useSmoothScroll(enabled = true) {
  const reduced = useReducedMotion()

  useEffect(() => {
    if (!enabled || reduced) {
      // Make sure a previously-mounted instance is torn down when we navigate
      // into the explorer, which needs raw wheel events.
      lenisInstance?.destroy()
      lenisInstance = null
      return
    }

    const lenis = new Lenis({
      duration: 1.05,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      touchMultiplier: 1.6,
      // Never intercept gestures inside the 3D canvas or a scrollable panel.
      prevent: (node) => node.hasAttribute?.('data-lenis-prevent') ?? false,
    })
    lenisInstance = lenis

    lenis.on('scroll', ScrollTrigger.update)

    const tick = (time: number) => lenis.raf(time * 1000)
    gsap.ticker.add(tick)
    gsap.ticker.lagSmoothing(0)

    ScrollTrigger.refresh()

    return () => {
      gsap.ticker.remove(tick)
      lenis.destroy()
      lenisInstance = null
    }
  }, [enabled, reduced])
}

/** Programmatic scroll that works whether or not Lenis is active. */
export function scrollToSection(id: string) {
  const el = document.getElementById(id)
  if (!el) return
  const lenis = getLenis()
  if (lenis) {
    lenis.scrollTo(el, { offset: -72, duration: 1.2 })
  } else {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

export { gsap, ScrollTrigger }
