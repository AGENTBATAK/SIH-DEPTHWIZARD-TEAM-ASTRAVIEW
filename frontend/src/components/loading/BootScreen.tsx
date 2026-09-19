import { useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { useSceneStore } from '../../hooks/useScene'
import { detectWebGL } from '../terrain/WebGLGate'
import { buildPlate } from '../compare/DepthComparator'
import { useReducedMotion } from '../../hooks/useSmoothScroll'
import { cn } from '../../lib/utils'

/**
 * Boot screen.
 *
 * Each step corresponds to work that genuinely happens: the WebGL probe, the
 * seeded terrain generation pass, and the derived raster renders. A progress bar
 * that counts to 100 on a timer while nothing loads is the cheapest possible lie
 * for an interface to tell, and this product is specifically arguing that it does
 * not tell those.
 */

interface Step {
  label: string
  run: () => Promise<void> | void
}

export function BootScreen({ onDone }: { onDone: () => void }) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [index, setIndex] = useState(0)
  const [done, setDone] = useState(false)
  const [webglOk, setWebglOk] = useState(true)
  const loadDemo = useSceneStore((s) => s.loadDemo)
  const reduced = useReducedMotion()

  const steps = useRef<Step[]>([
    {
      label: 'INITIALIZING WEBGL',
      run: () => {
        setWebglOk(detectWebGL())
      },
    },
    {
      label: 'BUILDING TERRAIN ENGINE',
      run: () => {
        // Real work: seeded height field, structure placement, raster renders.
        loadDemo()
      },
    },
    {
      label: 'RENDERING SCENE PRODUCTS',
      run: () => {
        // Real work: the depth, edge and contour plates each cost a full pass
        // over the raster plus a PNG encode. Doing them here rather than on
        // first scroll removes a visible hitch later.
        const scene = useSceneStore.getState().scene
        if (!scene) return
        buildPlate(scene, 'depth')
        buildPlate(scene, 'edge')
        buildPlate(scene, 'contour')
      },
    },
    { label: 'READY', run: () => {} },
  ])

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      for (let i = 0; i < steps.current.length; i++) {
        if (cancelled) return
        setIndex(i)
        // One frame of breathing room so each label is actually legible; the
        // work itself is synchronous enough to otherwise flash past.
        await new Promise((r) => requestAnimationFrame(() => setTimeout(r, reduced ? 0 : 190)))
        await steps.current[i].run()
      }
      if (!cancelled) setDone(true)
    }

    run()
    return () => {
      cancelled = true
    }
  }, [reduced])

  useEffect(() => {
    if (!done) return
    if (reduced) {
      onDone()
      return
    }
    const el = rootRef.current
    if (!el) {
      onDone()
      return
    }
    const tl = gsap.timeline({ onComplete: onDone })
    tl.to('[data-boot-panel]', { opacity: 0, y: -10, duration: 0.5, ease: 'power2.in' })
    tl.to(el, { clipPath: 'inset(0% 0% 100% 0%)', duration: 0.9, ease: 'expo.inOut' }, '-=0.15')
    return () => {
      tl.kill()
    }
  }, [done, onDone, reduced])

  const total = steps.current.length
  const pct = Math.round(((index + (done ? 1 : 0)) / total) * 100)

  return (
    <div
      ref={rootRef}
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-[200] flex items-center justify-center bg-void"
      style={{ clipPath: 'inset(0% 0% 0% 0%)' }}
    >
      <div className="dw-grid-bg absolute inset-0 opacity-30" />
      <div className="dw-grain absolute inset-0" />

      <div data-boot-panel className="relative w-full max-w-md px-8">
        <div className="mb-10">
          <div className="dw-label mb-4 text-cyan-core">DEPTHWIZARD</div>
          <div className="font-display text-3xl font-medium tracking-[-0.03em] text-ink">
            INITIALIZING
            <br />
            GEOSPATIAL CORE
          </div>
        </div>

        {/* Progress */}
        <div className="mb-6">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="dw-label">{steps.current[index]?.label ?? 'READY'}</span>
            <span className="dw-value text-xs text-cyan-core tabular">{pct}%</span>
          </div>
          {/* scaleX rather than width: a width transition relayouts the bar on
              every frame, and this runs while the scene is being generated. */}
          <div className="h-px w-full bg-white/10">
            <div
              className="h-px origin-left bg-cyan-core shadow-[0_0_10px_rgba(47,227,255,0.8)] transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]"
              style={{ transform: `scaleX(${pct / 100})` }}
            />
          </div>
        </div>

        {/* Step list */}
        <ul className="space-y-2">
          {steps.current.map((s, i) => {
            const state = i < index || done ? 'done' : i === index ? 'active' : 'pending'
            return (
              <li key={s.label} className="flex items-center gap-3">
                <span
                  className={cn(
                    'size-1 shrink-0 rounded-full transition-colors',
                    state === 'done'
                      ? 'bg-cyan-core'
                      : state === 'active'
                        ? 'animate-pulse bg-cyan-core'
                        : 'bg-line-bright',
                  )}
                />
                <span
                  className={cn(
                    'dw-label transition-colors',
                    state === 'pending' ? 'text-ink-faint/50' : 'text-ink-dim',
                  )}
                >
                  {s.label}
                </span>
                {state === 'done' && <span className="dw-label ml-auto text-cyan-core">OK</span>}
              </li>
            )
          })}
        </ul>

        {!webglOk && (
          <p className="mt-8 border-l border-amber-warn/50 pl-3 text-[11px] leading-relaxed text-amber-warn">
            WebGL is unavailable on this device. DepthWizard will fall back to 2D hillshaded
            rendering; all analysis remains available.
          </p>
        )}

        <div className="mt-10 flex items-center justify-between border-t border-line pt-4">
          <span className="dw-label">SIH 2026</span>
          <span className="dw-label">PS SIH26175 · ISRO</span>
        </div>
      </div>
    </div>
  )
}
