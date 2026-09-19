import { useEffect, useMemo, useRef, useState } from 'react'
import { Activity, Crosshair } from 'lucide-react'
import { useSceneStore } from '../../hooks/useScene'
import { histogram, residuals, transect, uvToLonLat } from '../../lib/terrain'
import { renderElevationMap } from '../../lib/raster'
import { contourIntervalFor } from '../terrain/terrainMaterial'
import { CalibrationScatter, HistogramChart, ProfileChart } from './Charts'
import { Metric, ProvenanceLegend } from '../ui/Metric'
import { Panel, PanelHeader, Section, SectionHeading, Slider, Tag } from '../ui/Primitives'
import { rampToCss } from '../../lib/colormaps'
import { fmt, fmtLat, fmtLon } from '../../lib/format'
import { cn } from '../../lib/utils'

/**
 * DSM analytics.
 *
 * The important editorial decision here: when there is no reference surface,
 * this panel shows dashes and says why. It does not fall back to a plausible
 * number. Error metrics against nothing are not error metrics, and a judge who
 * asks "what is this RMSE measured against?" should get an answer that holds.
 */
export function AnalyticsSection() {
  const scene = useSceneStore((s) => s.scene)
  const exaggeration = useSceneStore((s) => s.exaggeration)
  const setExaggeration = useSceneStore((s) => s.setExaggeration)
  const ramp = useSceneStore((s) => s.ramp)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [probe, setProbe] = useState<{ u: number; v: number } | null>(null)

  /* -------------------------------------------------------- 2D elevation map */

  const mapCanvas = useMemo(() => {
    if (!scene) return null
    return renderElevationMap(scene.terrain, {
      ramp,
      exaggeration,
      contourInterval: contourIntervalFor(
        scene.terrain.maxElevation - scene.terrain.minElevation,
      ),
      // Oversample the grid: the map is displayed far larger than 256 px, and
      // sampleGrid interpolates, so this buys real sharpness rather than blur.
      resolution: 512,
    })
  }, [scene, ramp, exaggeration])

  useEffect(() => {
    const target = canvasRef.current
    if (!target || !mapCanvas) return
    target.width = mapCanvas.width
    target.height = mapCanvas.height
    const ctx = target.getContext('2d')
    ctx?.drawImage(mapCanvas, 0, 0)
  }, [mapCanvas])

  /* ------------------------------------------------------------------ data */

  const analysis = useMemo(() => {
    if (!scene) return null
    const { terrain, dsm, depth, metrics, reference } = scene

    const elevationHist = histogram(dsm.heights, 44, [terrain.minElevation, terrain.maxElevation])

    const residualHist = reference
      ? histogram(residuals(dsm.heights, reference.grid), 44)
      : null

    // Transect: horizontal line through the probe, else the stored diagonal.
    const a: [number, number] = probe ? [0, probe.v] : [0.1, 0.8]
    const b: [number, number] = probe ? [1, probe.v] : [0.9, 0.2]
    const profile = transect(dsm.heights, dsm.size, a, b, 120)
    const referenceProfile = reference
      ? transect(reference.grid, dsm.size, a, b, 120)
      : undefined

    // Subsample for the scatter — 65k points would be a solid block of ink.
    const scatter: Array<[number, number]> = []
    if (reference) {
      const stride = Math.max(1, Math.floor(depth.data.length / 1400))
      for (let i = 0; i < depth.data.length; i += stride) {
        scatter.push([depth.data[i], reference.grid[i]])
      }
    }

    return {
      elevationHist,
      residualHist,
      profile,
      referenceProfile,
      scatter,
      metrics,
      hasReference: Boolean(reference),
      profileMin: Math.min(...profile, ...(referenceProfile ?? [Infinity])),
      profileMax: Math.max(...profile, ...(referenceProfile ?? [-Infinity])),
      a,
      b,
    }
  }, [scene, probe])

  if (!scene || !analysis) {
    return (
      <Section id="analytics" className="min-h-[50vh] bg-void">
        <div className="dw-grid-bg size-full opacity-20" />
      </Section>
    )
  }

  const probeReadout = probe
    ? (() => {
        const [lon, lat] = uvToLonLat(scene.terrain.bounds, probe.u, probe.v)
        return { lon, lat }
      })()
    : null

  return (
    <Section id="analytics" className="bg-void py-28 sm:py-36 lg:py-44">
      <div className="mx-auto max-w-[1680px] px-4 sm:px-10 lg:px-16">
        <SectionHeading
          index="09"
          eyebrow="VALIDATION"
          title={
            <>
              WHAT THE
              <br />
              SURFACE MEASURES
            </>
          }
          lede="Elevation distribution, error against the anchor surface, and a live profile. Every figure below is computed in the browser from the loaded raster — nothing is a stored benchmark."
        />

        <div className="mt-14 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          {/* ------------------------------------------------ elevation map */}
          <Panel className="overflow-hidden p-0" ticks>
            <PanelHeader
              title="2D ELEVATION MAP"
              right={<Tag tone="cyan">HILLSHADE + CONTOURS</Tag>}
            />
            <div
              className="relative aspect-square w-full cursor-crosshair"
              data-cursor="crosshair"
              onPointerMove={(e) => {
                const r = e.currentTarget.getBoundingClientRect()
                setProbe({
                  u: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
                  v: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
                })
              }}
              onPointerLeave={() => setProbe(null)}
            >
              <canvas ref={canvasRef} className="size-full" aria-label="Hillshaded elevation map" />

              {probe && (
                <>
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 h-px bg-amber-warn/70"
                    style={{ top: `${probe.v * 100}%` }}
                  />
                  <div
                    aria-hidden
                    className="pointer-events-none absolute size-5 -translate-x-1/2 -translate-y-1/2 border border-amber-warn"
                    style={{ left: `${probe.u * 100}%`, top: `${probe.v * 100}%` }}
                  />
                  <div
                    className="pointer-events-none absolute left-2 top-2 border border-line bg-void/85 px-2 py-1.5 backdrop-blur"
                    aria-live="off"
                  >
                    <div className="dw-value text-[10px] text-amber-warn">
                      TRANSECT @ {probeReadout ? fmtLat(probeReadout.lat, 4) : ''}
                    </div>
                    <div className="dw-value text-[10px] text-ink-dim">
                      {probeReadout ? fmtLon(probeReadout.lon, 4) : ''}
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-4 border-t border-line px-3 py-3">
              <div className="flex min-w-[180px] flex-1 items-center gap-2">
                <span className="dw-value text-[10px] text-ink-faint">
                  {fmt(scene.terrain.minElevation, 0)} m
                </span>
                <div className="h-1.5 flex-1" style={{ background: rampToCss(ramp) }} />
                <span className="dw-value text-[10px] text-ink-faint">
                  {fmt(scene.terrain.maxElevation, 0)} m
                </span>
              </div>
              <div className="w-full max-w-[220px]">
                <Slider
                  label="EXAGGERATION"
                  value={exaggeration}
                  min={0.5}
                  max={5}
                  step={0.1}
                  marks={[0.5, 1, 2, 5]}
                  format={(v) => `${v.toFixed(1)}×`}
                  onChange={setExaggeration}
                />
              </div>
            </div>
            <p className="border-t border-line px-3 py-2 text-[11px] leading-relaxed text-ink-faint">
              The exaggeration control drives both this map's relief shading and the 3D mesh above.
              At 1.0× the vertical scale is true.
            </p>
          </Panel>

          {/* ----------------------------------------------------- metrics */}
          <div className="flex flex-col gap-6">
            <Panel className="p-0">
              <PanelHeader
                title="DSM VALIDATION"
                right={
                  analysis.hasReference ? (
                    <Tag tone="teal">{scene.reference?.label}</Tag>
                  ) : (
                    <Tag tone="amber">NO REFERENCE</Tag>
                  )
                }
              />
              <div className="p-4">
                <div className="grid grid-cols-3 gap-4">
                  <Metric label="RMSE" value={analysis.metrics.rmse} decimals={2} size="lg" />
                  <Metric label="MAE" value={analysis.metrics.mae} decimals={2} size="lg" />
                  <Metric
                    label="Correlation"
                    value={analysis.metrics.correlation}
                    decimals={3}
                    size="lg"
                  />
                </div>

                <div className="dw-rule my-5" />

                <p className="text-[12px] leading-relaxed text-ink-dim">
                  {analysis.hasReference ? (
                    <>
                      Metrics are computed against the available reference elevation data
                      (<span className="text-ink">{scene.reference?.label}</span>) over{' '}
                      {analysis.metrics.sampleCount.value.toLocaleString()} cells. They describe
                      agreement with that surface — which is itself a model, not ground truth.
                    </>
                  ) : (
                    <>
                      This presentation scene has no reference elevation, so accuracy metrics are
                      unavailable. The prototype leaves them blank rather than inventing figures.
                    </>
                  )}
                </p>

                <div className="mt-5 border-t border-line pt-4">
                  <ProvenanceLegend />
                </div>
              </div>
            </Panel>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <Panel className="p-0">
                <PanelHeader
                  title="ELEVATION HISTOGRAM"
                  right={<Activity className="size-3.5 text-ink-faint" />}
                />
                <div className="p-3 text-ink">
                  <HistogramChart
                    bins={analysis.elevationHist.bins}
                    min={analysis.elevationHist.min}
                    max={analysis.elevationHist.max}
                    ramp={ramp}
                  />
                  <p className="mt-1 text-[10px] leading-snug text-ink-faint">
                    Cell count per elevation band across the DSM.
                  </p>
                </div>
              </Panel>

              <Panel className="p-0">
                <PanelHeader
                  title="ERROR DISTRIBUTION"
                  right={
                    analysis.residualHist ? (
                      <Tag tone="teal">SIGNED</Tag>
                    ) : (
                      <Tag tone="amber">N/A</Tag>
                    )
                  }
                />
                <div className="p-3 text-ink">
                  {analysis.residualHist ? (
                    <>
                      <HistogramChart
                        bins={analysis.residualHist.bins}
                        min={analysis.residualHist.min}
                        max={analysis.residualHist.max}
                        ramp="ember"
                        diverging
                      />
                      <p className="mt-1 text-[10px] leading-snug text-ink-faint">
                        DSM minus reference, in metres. Buildings sit in the positive tail — a bare-
                        earth reference does not contain them.
                      </p>
                    </>
                  ) : (
                    <div className="grid h-[150px] place-items-center">
                      <p className="max-w-[220px] text-center text-[11px] leading-relaxed text-ink-faint">
                        Requires a reference surface. Not shown rather than simulated.
                      </p>
                    </div>
                  )}
                </div>
              </Panel>
            </div>

            {/* --------------------------------------------------- profile */}
            <Panel className="p-0">
              <PanelHeader
                title="HEIGHT PROFILE"
                right={
                  <span className="flex items-center gap-2">
                    <Crosshair className="size-3 text-amber-warn" />
                    <span className="dw-label">{probe ? 'TRACKING CURSOR' : 'DEFAULT TRANSECT'}</span>
                  </span>
                }
              />
              <div className="p-3 text-ink">
                <ProfileChart
                  values={analysis.profile}
                  reference={analysis.referenceProfile}
                  min={analysis.profileMin}
                  max={analysis.profileMax}
                  marker={probe ? probe.u : null}
                />
                <div className="mt-2 flex flex-wrap items-center gap-4">
                  <LegendSwatch color="#2fe3ff" label="DSM" />
                  {analysis.referenceProfile && (
                    <LegendSwatch color="#17b3a3" label="REFERENCE" dashed />
                  )}
                  <span className="dw-label ml-auto">
                    {fmt(scene.terrain.extentMeters, 0)} m ACROSS
                  </span>
                </div>
                <p className="mt-2 text-[10px] leading-snug text-ink-faint">
                  Move the pointer over the elevation map to re-cut the transect anywhere in the
                  scene.
                </p>
              </div>
            </Panel>

            {/* ------------------------------------------------ calibration */}
            {analysis.scatter.length > 0 && scene.dsm.calibration.correlation && (
              <Panel className="p-0">
                <PanelHeader title="CALIBRATION FIT" right={<Tag tone="cyan">LEAST SQUARES</Tag>} />
                <div className="p-3 text-ink">
                  <CalibrationScatter
                    points={analysis.scatter}
                    scale={scene.dsm.calibration.scale.value}
                    offset={scene.dsm.calibration.offset.value}
                  />
                  <div className="mt-2 grid grid-cols-3 gap-3">
                    <Metric label="Scale" value={scene.dsm.calibration.scale} decimals={1} size="sm" />
                    <Metric label="Offset" value={scene.dsm.calibration.offset} decimals={1} size="sm" />
                    <Metric
                      label="Pearson r"
                      value={scene.dsm.calibration.correlation}
                      decimals={3}
                      size="sm"
                    />
                  </div>
                  <p className="mt-3 text-[10px] leading-snug text-ink-faint">
                    Horizontal axis: relative depth, 0–1, unitless. Vertical axis: reference
                    elevation in metres. The line is the transform that makes the output metric.
                  </p>
                </div>
              </Panel>
            )}
          </div>
        </div>
      </div>
    </Section>
  )
}

function LegendSwatch({
  color,
  label,
  dashed,
}: {
  color: string
  label: string
  dashed?: boolean
}) {
  return (
    <span className="flex items-center gap-2">
      <span
        aria-hidden
        className={cn('h-px w-6', dashed && 'opacity-70')}
        style={{
          background: dashed
            ? `repeating-linear-gradient(90deg, ${color} 0 3px, transparent 3px 6px)`
            : color,
        }}
      />
      <span className="dw-label">{label}</span>
    </span>
  )
}
