import { Boxes, Gauge, Layers, Satellite } from 'lucide-react'
import { Bezel, Counter, LitCard, Reveal, Section, SectionHeading, Tag } from '../ui/Primitives'
import { useSceneStore } from '../../hooks/useScene'

/**
 * Why DepthWizard.
 *
 * Positioned as a constraint argument rather than a feature list: the reason
 * single-view height estimation matters is that in the first hours of a
 * disaster, a single frame is often all that exists.
 */

/** `span` drives the bento: the grid is 12 columns and the cards alternate
 *  7/5 · 5/7 so no two rows share a rhythm. All spans reset below `md`. */
const PILLARS = [
  {
    icon: Satellite,
    title: 'A PRESENTATION YOU CAN DRIVE',
    body: 'The existing explorer is interactive: orbit, flythrough, layers and measurements work with a stable terrain raster for a live demonstration.',
    tag: 'INTERACTIVE',
    span: 'md:col-span-7',
  },
  {
    icon: Layers,
    title: 'UPLOADS BECOME SAVED SCENES',
    body: 'An image preview reaches the local backend, which creates a repeatable synthetic terrain scene that you can reopen after refreshing the page.',
    tag: 'LOCAL STORAGE',
    span: 'md:col-span-5',
  },
  {
    icon: Gauge,
    title: 'NO AI OR GIS DEPENDENCY',
    body: 'The prototype contains no model download, inference step, reference DEM lookup or map-tile requirement. It is designed to run predictably for a presentation.',
    tag: 'PRESENTATION MODE',
    span: 'md:col-span-5',
  },
  {
    icon: Boxes,
    title: 'A SURFACE YOU CAN INTERROGATE',
    body: 'The output is a DSM you can fly through, measure across and query per structure — not a picture of a result. Every number carries the source it came from.',
    tag: 'INTERACTIVE DSM',
    span: 'md:col-span-7',
  },
] as const

export function WhySection() {
  const scene = useSceneStore((s) => s.scene)

  return (
    <Section id="why" className="dw-mesh relative bg-void py-28 sm:py-36 lg:py-44">
      <div className="dw-grid-bg absolute inset-0 opacity-[0.14]" />

      <div className="relative mx-auto max-w-[1680px] px-4 sm:px-10 lg:px-16">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-16">
          <SectionHeading
            index="02"
            eyebrow="WHY DEPTHWIZARD"
            title={
              <>
                HEIGHT FROM
                <br />
                A SINGLE FRAME
              </>
            }
            lede="DepthWizard is prepared for presentation: a working local backend, persistent scene library and an interactive viewer, while the AI and GIS roadmap stays out of the runtime."
          />

          <div className="flex flex-col justify-center gap-6">
            <p className="text-[15px] leading-relaxed text-ink-dim">
              Upload an image and the browser sends a resized preview to the local backend. The
              backend stores it and returns a deterministic synthetic terrain field for the viewer.
            </p>
            <p className="text-[15px] leading-relaxed text-ink-dim">
              That terrain is intentionally not derived from image geometry. Its elevation range,
              footprint and measurements are illustrative, which is stated in the interface and
              stored alongside each returned scene.
            </p>
            <div className="dw-rule" />
            <p className="text-[13px] leading-relaxed text-ink-faint">
              The future product may add inference and calibration; this prototype deliberately
              does not imply either capability is present today.
            </p>
          </div>
        </div>

        {/* --------------------------------------------------------- pillars */}
        <div className="mt-24 grid grid-cols-1 gap-6 md:grid-cols-12">
          {PILLARS.map((p, i) => (
            <Reveal key={p.title} delay={i * 0.07} className={p.span}>
              <LitCard
                tilt
                bezel
                inner="flex h-full flex-col p-7 sm:p-8"
                className="h-full hover:bg-white/[0.05]"
              >
                <div className="mb-7 flex items-start justify-between gap-3">
                  <span className="grid size-11 place-items-center rounded-full border border-white/10 bg-white/[0.05] text-cyan-core shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
                    <p.icon className="size-4" strokeWidth={1.25} />
                  </span>
                  <Tag>{p.tag}</Tag>
                </div>
                <h3 className="font-display text-[17px] font-medium leading-snug tracking-[-0.015em] text-ink">
                  {p.title}
                </h3>
                <p className="mt-4 text-[13px] leading-relaxed text-ink-dim">{p.body}</p>
              </LitCard>
            </Reveal>
          ))}
        </div>

        {/* ----------------------------------------------------------- stats */}
        {scene && (
          <Bezel
            className="mt-20"
            inner="grid grid-cols-1 divide-y divide-white/[0.06] overflow-hidden sm:grid-cols-2 sm:divide-x lg:grid-cols-4"
          >
            {[
              {
                label: 'GRID CELLS',
                value: scene.terrain.size * scene.terrain.size,
                decimals: 0,
                suffix: '',
              },
              {
                label: 'GROUND SAMPLE',
                value: scene.terrain.extentMeters / scene.terrain.size,
                decimals: 1,
                suffix: ' m',
              },
              {
                label: 'SCENE EXTENT',
                value: scene.terrain.extentMeters / 1000,
                decimals: 2,
                suffix: ' km',
              },
              {
                label: 'STRUCTURES',
                value: scene.terrain.structures.length,
                decimals: 0,
                suffix: '',
              },
            ].map((stat) => (
              <div key={stat.label} className="px-7 py-8">
                <div className="dw-label mb-4">{stat.label}</div>
                <div className="font-display text-[2.1rem] font-medium leading-none tracking-[-0.035em] text-ink">
                  <Counter to={stat.value} decimals={stat.decimals} suffix={stat.suffix} />
                </div>
              </div>
            ))}
          </Bezel>
        )}
      </div>
    </Section>
  )
}
