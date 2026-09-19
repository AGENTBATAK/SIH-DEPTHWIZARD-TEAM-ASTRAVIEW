import { useMemo } from 'react'
import { Building2, MoveDiagonal, TriangleRight } from 'lucide-react'
import { useSceneStore } from '../../hooks/useScene'
import { InlineValue, Metric } from '../ui/Metric'
import { Panel, PanelHeader, Reveal, Section, SectionHeading, Tag } from '../ui/Primitives'
import { scrollToSection } from '../../hooks/useSmoothScroll'
import { derived } from '../../types'
import { histogram, slopeDegAt } from '../../lib/terrain'
import { HistogramChart } from '../analytics/Charts'
import { fmt } from '../../lib/format'
import { cn } from '../../lib/utils'

/**
 * Height and slope analysis.
 *
 * The structure table is the concrete payoff of the whole pipeline: per-object
 * heights derived from the DSM. It is also where over-claiming would be
 * easiest, so each row carries its provenance and the demo scene is labelled as
 * exactly what it is.
 */
export function MeasurementSection() {
  const scene = useSceneStore((s) => s.scene)
  const selectStructure = useSceneStore((s) => s.selectStructure)
  const selected = useSceneStore((s) => s.selectedStructure)
  const setTool = useSceneStore((s) => s.setTool)
  const measurements = useSceneStore((s) => s.measurements)

  const slopeStats = useMemo(() => {
    if (!scene) return null
    const { terrain } = scene
    // Sample slope on a coarse lattice — a full-resolution pass is wasted work
    // for a distribution chart.
    const step = Math.max(1, Math.floor(terrain.size / 96))
    const values: number[] = []
    for (let y = 0; y < terrain.size; y += step) {
      for (let x = 0; x < terrain.size; x += step) {
        values.push(
          slopeDegAt(
            terrain.heights,
            terrain.size,
            x / (terrain.size - 1),
            y / (terrain.size - 1),
            terrain.extentMeters,
          ),
        )
      }
    }
    const arr = Float32Array.from(values)
    const mean = values.reduce((a, b) => a + b, 0) / values.length
    const steep = values.filter((v) => v > 30).length / values.length
    return { hist: histogram(arr, 40, [0, Math.max(...values)]), mean, steep }
  }, [scene])

  const ranked = useMemo(
    () =>
      scene
        ? [...scene.terrain.structures].sort((a, b) => b.height.value - a.height.value).slice(0, 10)
        : [],
    [scene],
  )

  if (!scene || !slopeStats) {
    return <Section id="measure" className="min-h-[40vh] bg-void" />
  }

  const isDemo = scene.source === 'demo'

  return (
    <Section id="measure" className="bg-void py-28 sm:py-36 lg:py-44">
      <div className="mx-auto max-w-[1680px] px-4 sm:px-10 lg:px-16">
        <SectionHeading
          index="08"
          eyebrow="HEIGHT / SLOPE ANALYSIS"
          title={
            <>
              MEASURE
              <br />
              WHAT STANDS UP
            </>
          }
          lede="Distance, elevation difference and structure-height controls work directly on the loaded raster. For uploaded presentation scenes, their values are illustrative because the terrain is synthetic."
        />

        <div className="mt-14 grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* ------------------------------------------------ measurement */}
          <Reveal>
            <Panel className="flex h-full flex-col p-0">
              <PanelHeader
                title="POINT-TO-POINT"
                right={<MoveDiagonal className="size-3.5 text-ink-faint" />}
              />
              <div className="flex flex-1 flex-col p-4">
                <p className="text-[12.5px] leading-relaxed text-ink-dim">
                  Pick two points in the explorer. DepthWizard reports ground distance, elevation
                  difference and the slope between them — measured across the surface, not straight
                  through it.
                </p>

                {measurements.length > 0 ? (
                  <ul className="mt-5 space-y-3">
                    {measurements.slice(-3).map((m) => (
                      <li key={m.id} className="border-l border-cyan-core/40 pl-3">
                        <div className="grid grid-cols-3 gap-2">
                          <Metric label="Distance" value={m.distance} decimals={1} size="sm" />
                          <Metric label="Δ elev." value={m.deltaElevation} decimals={1} size="sm" />
                          <Metric label="Slope" value={m.slope} decimals={1} size="sm" />
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="mt-5 border border-dashed border-line-bright p-4">
                    <p className="text-[11px] leading-relaxed text-ink-faint">
                      No measurements taken yet. Enable the measure tool in the explorer and click
                      two points on the terrain.
                    </p>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setTool('measure')
                    scrollToSection('explorer')
                  }}
                  className="dw-label mt-auto pt-5 text-left text-cyan-core transition-opacity hover:opacity-70"
                >
                  OPEN MEASURE TOOL →
                </button>
              </div>
            </Panel>
          </Reveal>

          {/* ------------------------------------------------------ slope */}
          <Reveal delay={0.08}>
            <Panel className="flex h-full flex-col p-0">
              <PanelHeader
                title="SLOPE DISTRIBUTION"
                right={<TriangleRight className="size-3.5 text-ink-faint" />}
              />
              <div className="flex flex-1 flex-col p-4 text-ink">
                <HistogramChart
                  bins={slopeStats.hist.bins}
                  min={slopeStats.hist.min}
                  max={slopeStats.hist.max}
                  unit="°"
                  ramp="ember"
                  height={140}
                />
                <div className="mt-4 grid grid-cols-2 gap-4">
                  <Metric
                    label="Mean slope"
                    value={derived(
                      slopeStats.mean,
                      '°',
                      'Mean of central-difference slope over a sampled lattice.',
                    )}
                    decimals={1}
                    size="sm"
                  />
                  <Metric
                    label="Above 30°"
                    value={derived(
                      slopeStats.steep * 100,
                      '%',
                      'Share of sampled cells steeper than 30 degrees.',
                    )}
                    decimals={1}
                    size="sm"
                  />
                </div>
                <p className="mt-4 text-[11px] leading-relaxed text-ink-faint">
                  Slope is computed from the DSM, so tall structures register as near-vertical
                  faces. For terrain-only slope, a bare-earth model is the correct input.
                </p>
              </div>
            </Panel>
          </Reveal>

          {/* ------------------------------------------------- structures */}
          <Reveal delay={0.16}>
            <Panel className="flex h-full flex-col p-0">
              <PanelHeader
                title="STRUCTURE HEIGHTS"
                right={
                  isDemo ? (
                    <Tag tone="amber">DEMO</Tag>
                  ) : (
                    <Tag tone="cyan">{scene.terrain.structures.length} FOUND</Tag>
                  )
                }
              />
              <div className="flex flex-1 flex-col p-0">
                {ranked.length > 0 ? (
                  <ul data-lenis-prevent className="max-h-[300px] flex-1 overflow-y-auto">
                    {ranked.map((s) => (
                      <li key={s.id}>
                        <button
                          type="button"
                          onClick={() => {
                            selectStructure(s)
                            scrollToSection('explorer')
                          }}
                          className={cn(
                            'flex w-full items-center gap-3 border-b border-line px-4 py-2.5 text-left transition-colors',
                            selected?.id === s.id
                              ? 'bg-cyan-core/[0.07]'
                              : 'hover:bg-white/[0.03]',
                          )}
                        >
                          <Building2
                            className={cn(
                              'size-3.5 shrink-0',
                              selected?.id === s.id ? 'text-cyan-core' : 'text-ink-faint',
                            )}
                          />
                          <span className="dw-label flex-1 text-ink-dim">{s.label}</span>
                          <span className="dw-value text-[11px] text-ink">
                            <InlineValue value={s.height} decimals={1} />
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="grid flex-1 place-items-center p-6">
                    <p className="max-w-[220px] text-center text-[11px] leading-relaxed text-ink-faint">
                      No structures are catalogued for this scene. Structure extraction runs on the
                      demo scene; for uploads it needs a segmentation step DepthWizard does not
                      perform in the browser.
                    </p>
                  </div>
                )}

                <p className="border-t border-line p-4 text-[11px] leading-relaxed text-ink-faint">
                  {isDemo
                    ? 'Demo scene structures have exact heights by construction. Uploaded presentation scenes are synthetic and do not represent real structures.'
                    : 'Heights are roof elevation minus surrounding ground elevation, both read from the DSM.'}
                </p>
              </div>
            </Panel>
          </Reveal>
        </div>

        {/* Tallest callout */}
        {ranked[0] && (
          <div className="mt-6 flex flex-wrap items-center gap-6 border border-line bg-graphite/40 p-5">
            <div className="flex items-center gap-3">
              <span className="dw-label">TALLEST IN SCENE</span>
              <span className="dw-value text-sm text-ink">{ranked[0].label}</span>
            </div>
            <div className="flex flex-wrap items-center gap-8">
              <Metric label="Est. height" value={ranked[0].height} decimals={1} size="md" />
              <Metric label="Base" value={ranked[0].baseElevation} decimals={1} size="md" />
              <Metric label="Top" value={ranked[0].topElevation} decimals={1} size="md" />
            </div>
            <p className="ml-auto max-w-xs text-[11px] leading-relaxed text-ink-faint">
              {fmt(ranked[0].height.value, 1)} m of relief resolved from a surface that started as
              one image with no vertical units at all.
            </p>
          </div>
        )}
      </div>
    </Section>
  )
}
