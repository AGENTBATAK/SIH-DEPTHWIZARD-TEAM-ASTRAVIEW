import { useEffect, useMemo, useRef, useState } from 'react'
import { Building, Droplets, Mountain, Radar } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useSceneStore } from '../../hooks/useScene'
import { sampleGrid, slopeDegAt } from '../../lib/terrain'
import { sampleRamp } from '../../lib/colormaps'
import { hillshade } from '../../lib/terrain'
import { Metric } from '../ui/Metric'
import { Panel, Reveal, Section, SectionHeading, Slider, Tag } from '../ui/Primitives'
import { derived, simulated, type TerrainData } from '../../types'
import { clamp } from '../../lib/noise'
import { cn } from '../../lib/utils'

/**
 * Disaster management applications.
 *
 * Each panel runs a real analysis over the loaded raster — inundation extent at
 * a chosen level, slope thresholding, structure exposure — so the numbers move
 * when the scene or the control moves. The framing is deliberately conditional:
 * these are what a metric surface makes possible, not claims of operational
 * accuracy.
 */

type Mode = 'flood' | 'slope' | 'urban' | 'infrastructure'

interface Application {
  id: Mode
  icon: LucideIcon
  title: string
  claim: string
  body: string
  caveat: string
}

const APPLICATIONS: Application[] = [
  {
    id: 'flood',
    icon: Droplets,
    title: 'FLOOD ASSESSMENT',
    claim: 'Potential application',
    body: 'With a surface in metres, inundation extent at a given water level is a threshold operation. Move the level and the affected area, exposed structures and shoreline update directly from the raster.',
    caveat:
      'A bathtub fill ignores hydrological connectivity, flow and infrastructure. It supports rapid terrain understanding; it is not a flood model.',
  },
  {
    id: 'slope',
    icon: Mountain,
    title: 'LANDSLIDE / SLOPE ANALYSIS',
    claim: 'Supports exploratory assessment',
    body: 'Slope is the first-order control on mass movement. Thresholding the gradient field highlights terrain steep enough to warrant attention, and the distribution shows how much of the scene is in each band.',
    caveat:
      'Slope alone does not determine susceptibility — lithology, saturation, land cover and trigger all matter. This is a screening view.',
  },
  {
    id: 'urban',
    icon: Building,
    title: 'URBAN RECONNAISSANCE',
    claim: 'Can assist rapid orientation',
    body: 'A DSM separates built structure from ground. Roof elevations, building footprints and their heights above surrounding terrain come out of the same raster with no additional acquisition.',
    caveat:
      'Structure delineation on real imagery needs a segmentation step DepthWizard does not perform in the browser. The demo scene has known footprints by construction.',
  },
  {
    id: 'infrastructure',
    icon: Radar,
    title: 'INFRASTRUCTURE INSPECTION',
    claim: 'Potential application',
    body: 'Tall or isolated structures can be ranked by height above local ground, giving a fast triage list for closer inspection after an event.',
    caveat:
      'Height precision is bounded by the calibration step and the ground sample distance, not by the depth model in isolation.',
  },
]

/* --------------------------------------------------------------- rendering */

function renderScenario(
  terrain: TerrainData,
  mode: Mode,
  param: number,
  res: number,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = res
  canvas.height = res
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(res, res)

  const shade = hillshade(terrain.heights, terrain.size, terrain.extentMeters, 315, 40)
  const span = terrain.maxElevation - terrain.minElevation || 1
  const level = terrain.minElevation + span * param

  const structureMask = new Float32Array(res * res)
  if (mode === 'urban' || mode === 'infrastructure') {
    for (const s of terrain.structures) {
      if (mode === 'infrastructure' && s.height.value < 20) continue
      const pad = mode === 'infrastructure' ? 0.01 : 0.004
      const x0 = Math.max(0, Math.floor((s.u - s.fw / 2 - pad) * (res - 1)))
      const x1 = Math.min(res - 1, Math.ceil((s.u + s.fw / 2 + pad) * (res - 1)))
      const y0 = Math.max(0, Math.floor((s.v - s.fd / 2 - pad) * (res - 1)))
      const y1 = Math.min(res - 1, Math.ceil((s.v + s.fd / 2 + pad) * (res - 1)))
      const weight = clamp(s.height.value / 60, 0.25, 1)
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) structureMask[y * res + x] = weight
      }
    }
  }

  for (let y = 0; y < res; y++) {
    const v = y / (res - 1)
    for (let x = 0; x < res; x++) {
      const u = x / (res - 1)
      const i = y * res + x
      const elev = sampleGrid(terrain.heights, terrain.size, u, v)
      const t = clamp((elev - terrain.minElevation) / span, 0, 1)
      const sh = sampleGrid(shade, terrain.size, u, v)

      // Desaturated base so the analysis overlay carries all the colour.
      let [r, g, b] = sampleRamp('mono', t * 0.75 + 0.1)
      const lit = 0.3 + 0.85 * sh
      r *= lit
      g *= lit
      b *= lit

      if (mode === 'flood' && elev <= level) {
        const depthBelow = clamp((level - elev) / (span * 0.35), 0, 1)
        r = r * 0.25 + 0.05
        g = g * 0.3 + 0.42 * (0.4 + depthBelow * 0.6)
        b = b * 0.3 + 0.62 * (0.5 + depthBelow * 0.5)
      }

      if (mode === 'slope') {
        const slope = slopeDegAt(terrain.heights, terrain.size, u, v, terrain.extentMeters)
        const threshold = 12 + param * 38
        if (slope > threshold) {
          const excess = clamp((slope - threshold) / 25, 0, 1)
          r = r * 0.3 + 0.72 * (0.5 + excess * 0.5)
          g = g * 0.3 + 0.4 * (0.4 + excess * 0.4)
          b = b * 0.35 + 0.13
        }
      }

      if (structureMask[i] > 0) {
        const w = structureMask[i]
        r = r * 0.3 + 0.16
        g = g * 0.3 + 0.78 * w
        b = b * 0.3 + 0.92 * w
      }

      const o = i * 4
      img.data[o] = clamp(r, 0, 1) * 255
      img.data[o + 1] = clamp(g, 0, 1) * 255
      img.data[o + 2] = clamp(b, 0, 1) * 255
      img.data[o + 3] = 255
    }
  }

  ctx.putImageData(img, 0, 0)
  return canvas
}

/* ------------------------------------------------------------------ panel */

function ScenarioCanvas({
  terrain,
  mode,
  param,
}: {
  terrain: TerrainData
  mode: Mode
  param: number
}) {
  const ref = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const target = ref.current
    if (!target) return
    const res = Math.min(terrain.size, 256)
    const source = renderScenario(terrain, mode, param, res)
    target.width = res
    target.height = res
    target.getContext('2d')?.drawImage(source, 0, 0)
  }, [terrain, mode, param])

  return <canvas ref={ref} className="size-full object-cover" aria-hidden />
}

export function ApplicationsSection() {
  const scene = useSceneStore((s) => s.scene)
  const [floodLevel, setFloodLevel] = useState(0.18)
  const [slopeParam] = useState(0.35)

  const stats = useMemo(() => {
    if (!scene) return null
    const { terrain } = scene
    const span = terrain.maxElevation - terrain.minElevation || 1
    const level = terrain.minElevation + span * floodLevel

    let below = 0
    for (let i = 0; i < terrain.heights.length; i++) {
      if (terrain.heights[i] <= level) below++
    }

    const exposed = terrain.structures.filter((s) => s.baseElevation.value <= level).length

    // Slope band shares, on a coarse lattice.
    const step = Math.max(1, Math.floor(terrain.size / 80))
    let steep = 0
    let total = 0
    for (let y = 0; y < terrain.size; y += step) {
      for (let x = 0; x < terrain.size; x += step) {
        const s = slopeDegAt(
          terrain.heights,
          terrain.size,
          x / (terrain.size - 1),
          y / (terrain.size - 1),
          terrain.extentMeters,
        )
        if (s > 12 + slopeParam * 38) steep++
        total++
      }
    }

    const tall = terrain.structures.filter((s) => s.height.value >= 20).length
    const areaKm2 = (terrain.extentMeters / 1000) ** 2

    return {
      level,
      inundatedFraction: below / terrain.heights.length,
      inundatedArea: (below / terrain.heights.length) * areaKm2,
      exposed,
      steepFraction: steep / total,
      tall,
    }
  }, [scene, floodLevel, slopeParam])

  if (!scene || !stats) {
    return <Section id="applications" className="min-h-[40vh] bg-void" />
  }

  const isDemo = scene.source === 'demo'
  const tagFor = isDemo ? simulated : derived

  return (
    <Section id="applications" className="bg-void py-28 sm:py-36 lg:py-44">
      <div className="mx-auto max-w-[1680px] px-4 sm:px-10 lg:px-16">
        <SectionHeading
          index="12"
          eyebrow="DISASTER MANAGEMENT"
          title={
            <>
              WHAT A METRIC
              <br />
              SURFACE UNLOCKS
            </>
          }
          lede="Four scenarios where a height model derived from a single frame could shorten the gap between an event and a first assessment. Each panel is computed live from the loaded scene."
        />

        <div className="mt-14 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {APPLICATIONS.map((app, i) => {
            const param = app.id === 'flood' ? floodLevel : slopeParam
            return (
              <Reveal key={app.id} delay={i * 0.06}>
                <Panel className="flex h-full flex-col overflow-hidden p-0">
                  {/* Visual */}
                  <div className="relative aspect-[16/9] w-full overflow-hidden bg-abyss">
                    <ScenarioCanvas terrain={scene.terrain} mode={app.id} param={param} />
                    <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(4,5,7,0.28)_0%,transparent_35%,rgba(4,5,7,0.75)_100%)]" />

                    <div className="absolute left-3 top-3 flex items-center gap-2">
                      <span className="grid size-7 place-items-center border border-cyan-core/40 bg-void/70 text-cyan-core backdrop-blur">
                        <app.icon className="size-3.5" />
                      </span>
                      <Tag tone="cyan">{app.claim}</Tag>
                    </div>

                    {/* Live readout */}
                    <div className="absolute bottom-3 left-3 right-3 flex flex-wrap items-end justify-between gap-4">
                      {app.id === 'flood' && (
                        <>
                          <Metric
                            label="Inundated area"
                            value={tagFor(
                              stats.inundatedArea,
                              'km²',
                              'Cells at or below the selected level, scaled by the scene footprint.',
                            )}
                            decimals={2}
                            size="md"
                          />
                          <Metric
                            label="Structures below level"
                            value={tagFor(
                              stats.exposed,
                              '',
                              'Structures whose base elevation is at or below the selected level.',
                            )}
                            decimals={0}
                            size="md"
                          />
                        </>
                      )}
                      {app.id === 'slope' && (
                        <>
                          <Metric
                            label="Above threshold"
                            value={tagFor(
                              stats.steepFraction * 100,
                              '%',
                              'Share of sampled cells exceeding the slope threshold.',
                            )}
                            decimals={1}
                            size="md"
                          />
                          <Metric
                            label="Threshold"
                            value={derived(
                              12 + slopeParam * 38,
                              '°',
                              'Slope threshold used for the overlay above.',
                            )}
                            decimals={0}
                            size="md"
                          />
                        </>
                      )}
                      {app.id === 'urban' && (
                        <>
                          <Metric
                            label="Structures"
                            value={tagFor(
                              scene.terrain.structures.length,
                              '',
                              'Catalogued structures in the loaded scene.',
                            )}
                            decimals={0}
                            size="md"
                          />
                          <Metric
                            label="Scene extent"
                            value={derived(
                              scene.terrain.extentMeters / 1000,
                              'km',
                              'Ground extent of one side of the footprint.',
                            )}
                            decimals={2}
                            size="md"
                          />
                        </>
                      )}
                      {app.id === 'infrastructure' && (
                        <>
                          <Metric
                            label="Above 20 m"
                            value={tagFor(stats.tall, '', 'Structures taller than 20 m.')}
                            decimals={0}
                            size="md"
                          />
                          <Metric
                            label="Tallest"
                            value={
                              scene.terrain.structures.length
                                ? scene.terrain.structures.reduce((a, b) =>
                                    a.height.value > b.height.value ? a : b,
                                  ).height
                                : tagFor(NaN, 'm')
                            }
                            decimals={1}
                            size="md"
                          />
                        </>
                      )}
                    </div>
                  </div>

                  {/* Copy */}
                  <div className="flex flex-1 flex-col p-5">
                    <h3 className="font-display text-lg font-medium tracking-[-0.02em] text-ink">
                      {app.title}
                    </h3>
                    <p className="mt-3 text-[12.5px] leading-relaxed text-ink-dim">{app.body}</p>

                    {app.id === 'flood' && (
                      <div className="mt-5">
                        <Slider
                          label="WATER LEVEL"
                          value={stats.level}
                          min={scene.terrain.minElevation}
                          max={scene.terrain.minElevation + (scene.terrain.maxElevation - scene.terrain.minElevation) * 0.6}
                          step={0.5}
                          format={(v) => `${v.toFixed(1)} m`}
                          onChange={(v) =>
                            setFloodLevel(
                              (v - scene.terrain.minElevation) /
                                (scene.terrain.maxElevation - scene.terrain.minElevation || 1),
                            )
                          }
                        />
                      </div>
                    )}

                    <p
                      className={cn(
                        'mt-auto border-l pt-0 text-[11px] leading-relaxed',
                        'border-amber-warn/40 pl-3 text-ink-faint',
                        app.id === 'flood' ? 'mt-5' : 'mt-5',
                      )}
                    >
                      {app.caveat}
                    </p>
                  </div>
                </Panel>
              </Reveal>
            )
          })}
        </div>
      </div>
    </Section>
  )
}
