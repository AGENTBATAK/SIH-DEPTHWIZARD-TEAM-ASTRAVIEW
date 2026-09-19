import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { gsap } from 'gsap'
import { ArrowRight, Boxes, MoveDown } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../ui/Button'
import { Metric } from '../ui/Metric'
import { Tag } from '../ui/Primitives'
import { useSceneStore } from '../../hooks/useScene'
import { useReducedMotion, scrollToSection } from '../../hooks/useSmoothScroll'
import { derived, simulated } from '../../types'
import { fmtElapsed } from '../../lib/format'
import { isPrologueActive, riseRef } from '../prologue/stageState'

/**
 * Hero.
 *
 * The boot sequence is a single GSAP timeline rather than a pile of CSS
 * animations, because the ordering matters: the grid has to establish the frame
 * before the scan line implies a sensor, and the terrain has to be visibly
 * assembling before the wordmark lands on top of it. Reduced-motion users get
 * the final state immediately, with no intermediate frames.
 *
 * The terrain itself lives on the shared `StageCanvas`, not here — the space
 * prologue above has to fly a single camera down onto this exact scene, and it
 * cannot do that across two WebGL contexts. What remains here is the DOM that
 * sits over the stage.
 */

export function Hero({ booted }: { booted: boolean }) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const navigate = useNavigate()
  const reduced = useReducedMotion()

  const scene = useSceneStore((s) => s.scene)

  const telemetry = useMemo(() => {
    if (!scene) return null
    const nodes = scene.terrain.size * scene.terrain.size
    return {
      generation: scene.depth.elapsedMs,
      // 'samples', not 'vertices'. They were the same number when the mesh was
      // a fixed grid; they are not now that it tessellates adaptively, and this
      // is the larger of the two. Reporting the height field as a vertex count
      // would overstate what is actually being drawn — which is the one thing
      // this interface is not allowed to do.
      nodes: derived(
        nodes,
        'samples',
        'Height field resolution squared. The surface mesh samples this field in the vertex shader and subdivides to match it as the camera closes, up to the full 1024².',
      ),
      range: derived(
        scene.terrain.maxElevation - scene.terrain.minElevation,
        'm',
        'Elevation span of the loaded scene raster.',
      ),
    }
  }, [scene])

  useLayoutEffect(() => {
    if (!booted || !rootRef.current) return

    // With a prologue above, the descent owns the terrain's assembly and the
    // hero is off screen at boot. Running the reveal on mount would spend the
    // payoff while the visitor is still in orbit, so it waits for arrival
    // instead.
    const prologue = isPrologueActive()

    const ctx = gsap.context(() => {
      if (reduced) {
        riseRef.current = 1
        gsap.set('[data-boot]', { opacity: 1, y: 0, clipPath: 'inset(0% 0% 0% 0%)' })
        gsap.set('[data-boot-grid]', { opacity: 1 })
        // The buttons and telemetry cells carry `opacity-0` as a class so they
        // start hidden for the timeline. Setting the containers visible does
        // not clear that class off the children, so without this the primary
        // calls to action stay invisible for the whole session — the one group
        // of users who cannot simply scroll past the animation to recover.
        gsap.set(
          '[data-boot="cta"] > *, [data-boot="telemetry"] .dw-core > *, [data-boot-word]',
          { opacity: 1, y: 0, yPercent: 0 },
        )
        return
      }

      const tl = gsap.timeline({
        defaults: { ease: 'expo.out' },
        paused: prologue,
        scrollTrigger: prologue
          ? {
              trigger: rootRef.current,
              // Fires as the hero takes the frame, which is the moment the
              // descent has finished putting the camera on the terrain.
              start: 'top 62%',
              once: true,
            }
          : undefined,
      })

      // 1–2 · frame establishes
      tl.fromTo('[data-boot-grid]', { opacity: 0 }, { opacity: 1, duration: 1.1 }, 0)

      // 3 · sensor sweep
      tl.fromTo(
        '[data-boot-scan]',
        { top: '0%', opacity: 0 },
        { top: '100%', opacity: 1, duration: 1.5, ease: 'power2.inOut' },
        0.15,
      ).to('[data-boot-scan]', { opacity: 0, duration: 0.4 }, '>-0.2')

      // 4–5 · terrain assembles from the ground up — but only when nothing
      // else is already driving it. The descent and this timeline writing the
      // same ref would make the terrain fight itself.
      if (!prologue) {
        tl.to(riseRef, { current: 1, duration: 2.6, ease: 'power2.out' }, 0.5)
      }

      // 6–7 · wordmark, one line at a time, revealed rather than faded
      tl.fromTo(
        '[data-boot-word="depth"]',
        { yPercent: 108, opacity: 0 },
        { yPercent: 0, opacity: 1, duration: 1.15 },
        1.25,
      )
      tl.fromTo(
        '[data-boot-word="wizard"]',
        { yPercent: 108, opacity: 0 },
        { yPercent: 0, opacity: 1, duration: 1.15 },
        1.42,
      )

      // 8–10 · supporting content, then controls
      tl.fromTo(
        '[data-boot="eyebrow"]',
        { opacity: 0, x: -14 },
        { opacity: 1, x: 0, duration: 0.9 },
        1.1,
      )
      tl.fromTo(
        '[data-boot="sub"]',
        { opacity: 0, y: 16 },
        { opacity: 1, y: 0, duration: 0.9 },
        1.95,
      )
      tl.fromTo(
        '[data-boot="telemetry"] .dw-core > *',
        { opacity: 0, y: 14 },
        { opacity: 1, y: 0, duration: 0.8, stagger: 0.09 },
        2.1,
      )
      tl.fromTo(
        '[data-boot="cta"] > *',
        { opacity: 0, y: 12 },
        { opacity: 1, y: 0, duration: 0.8, stagger: 0.08 },
        2.35,
      )
      tl.fromTo('[data-boot="scroll"]', { opacity: 0 }, { opacity: 1, duration: 0.8 }, 2.9)
    }, rootRef)

    return () => ctx.revert()
  }, [booted, reduced])

  // Keep the terrain assembled if the scene arrives after the timeline ran.
  useEffect(() => {
    if (reduced) riseRef.current = 1
  }, [reduced])

  return (
    <section
      id="hero"
      ref={rootRef}
      className="relative min-h-[100dvh] w-full overflow-hidden"
    >
      {/* ---------------------------------------------------------- backdrop */}
      <div data-boot-grid className="absolute inset-0 opacity-0">
        <div className="dw-grid-bg absolute inset-0 opacity-[0.55]" />
        <div className="dw-grid-fine absolute inset-0 opacity-[0.25]" />
      </div>

      {/* The terrain is not rendered here — it is on the shared StageCanvas
          behind this whole section, so the prologue's camera can fly onto it
          without a cut. What follows is the treatment that sits over it. */}

      {/* Readability wash — a gradient, not a translucent slab over the art. */}
      {/* The wash is masked in over the first tenth of the section rather than
          starting at full strength. While the hero is scrolling up over the
          shared stage, a wash with a hard top edge draws a horizontal line
          across the terrain — the one seam this whole arrangement exists to
          avoid. Ten vh is short enough to leave the wordmark fully backed. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(100deg,rgba(4,5,7,0.94)_0%,rgba(4,5,7,0.82)_34%,rgba(4,5,7,0.24)_62%,rgba(4,5,7,0.55)_100%)] [mask-image:linear-gradient(to_bottom,transparent_0,black_10vh)] [-webkit-mask-image:linear-gradient(to_bottom,transparent_0,black_10vh)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-void to-transparent"
      />
      {/* Ambient mesh, over the wash so the black ground has a temperature. */}
      <div aria-hidden className="dw-mesh pointer-events-none absolute inset-0" />

      {/* Boot scan line */}
      <div
        data-boot-scan
        aria-hidden
        className="pointer-events-none absolute inset-x-0 h-px opacity-0 bg-[linear-gradient(90deg,transparent,rgba(47,227,255,0.85),transparent)] shadow-[0_0_28px_rgba(47,227,255,0.6)]"
      />

      {/* ------------------------------------------------------------ content */}
      <div className="relative mx-auto flex min-h-[100dvh] w-full max-w-[1680px] flex-col justify-center px-4 pb-20 pt-28 sm:px-10 lg:px-16">
        <div data-boot="eyebrow" className="mb-7 flex flex-wrap items-center gap-3 opacity-0">
          <Tag tone="cyan">ISRO</Tag>
          <span className="dw-eyebrow">
            SIH26175
          </span>
        </div>

        <h1 className="font-display font-medium leading-[0.82] tracking-[-0.045em] text-ink">
          <span className="block overflow-hidden">
            <span
              data-boot-word="depth"
              className="block text-[clamp(3.6rem,min(13vw,17vh),11rem)]"
            >
              DEPTH
            </span>
          </span>
          <span className="block overflow-hidden">
            <span
              data-boot-word="wizard"
              className="block bg-[linear-gradient(96deg,#e7eef7_0%,#7fe9f5_46%,#2fe3ff_100%)] bg-clip-text text-[clamp(3.6rem,min(13vw,17vh),11rem)] text-transparent"
            >
              WIZARD
            </span>
          </span>
        </h1>

        <div data-boot="sub" className="mt-7 max-w-xl opacity-0">
          <p className="text-[clamp(1rem,1.5vw,1.3rem)] leading-relaxed text-ink-dim">
            Presentation imagery into explorable 3D terrain.
          </p>
          <p className="mt-4 text-[13px] leading-relaxed text-ink-faint">
            The included prototype saves image previews and generates clearly labelled synthetic
            terrain for a working presentation, without an AI or GIS pipeline.
          </p>
        </div>

        <div data-boot="cta" className="mt-10 flex flex-wrap items-center gap-3">
          <Button
            variant="primary"
            size="lg"
            className="opacity-0"
            trailing={<ArrowRight className="size-4" strokeWidth={1.5} />}
            onClick={() => scrollToSection('explorer')}
          >
            Explore the demo
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="opacity-0"
            icon={<Boxes className="size-4" strokeWidth={1.25} />}
            onClick={() => scrollToSection('workflow')}
          >
            View pipeline
          </Button>
          <Button
            variant="ghost"
            size="lg"
            className="opacity-0"
            onClick={() => navigate('/explorer')}
          >
            Launch full explorer
          </Button>
        </div>

        {/* --------------------------------------------------------- telemetry */}
        {telemetry && (
          <div data-boot="telemetry" className="dw-shell mt-12 max-w-2xl">
            <div className="dw-core grid grid-cols-1 divide-y divide-white/[0.06] overflow-hidden sm:grid-cols-3 sm:divide-x sm:divide-y-0 [&>*]:px-6 [&>*]:py-5">
            <Metric
              label="Terrain generation"
              value={simulated(
                telemetry.generation.value,
                'ms',
                'Time recorded while generating the synthetic presentation terrain.',
              )}
              decimals={0}
              size="md"
              hint={fmtElapsed(telemetry.generation.value)}
            />
            <Metric
              label="Elevation samples"
              value={telemetry.nodes}
              decimals={0}
              size="md"
              hint={`${scene!.terrain.size}² grid`}
            />
            <Metric
              label="Elevation range"
              value={telemetry.range}
              decimals={0}
              size="md"
              hint={`${scene!.terrain.minElevation.toFixed(0)}–${scene!.terrain.maxElevation.toFixed(0)} m`}
            />
            </div>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------ scroll */}
      <button
        data-boot="scroll"
        type="button"
        onClick={() => scrollToSection('why')}
        className="group absolute bottom-7 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-2 opacity-0"
        aria-label="Scroll to the next section"
      >
        <span className="dw-label transition-colors group-hover:text-cyan-core">SCROLL</span>
        <MoveDown className="size-3.5 animate-bounce text-ink-faint transition-colors group-hover:text-cyan-core" />
      </button>

      {/* Right-edge vertical strip — small, technical, sets the register. */}
      <div className="pointer-events-none absolute right-5 top-1/2 hidden -translate-y-1/2 flex-col items-center gap-4 lg:flex">
        <span className="h-16 w-px bg-gradient-to-b from-transparent to-line-bright" />
        <span className="dw-label [writing-mode:vertical-rl]">LIVE TERRAIN · WEBGL</span>
        <span className="h-16 w-px bg-gradient-to-t from-transparent to-line-bright" />
      </div>
    </section>
  )
}
