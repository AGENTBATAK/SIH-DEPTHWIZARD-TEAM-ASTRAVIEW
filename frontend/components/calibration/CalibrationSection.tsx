import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown } from 'lucide-react'
import { useSceneStore } from '../../hooks/useScene'
import { transect } from '../../lib/terrain'
import { Metric } from '../ui/Metric'
import { Panel, PanelHeader, Section, SectionHeading, Tag } from '../ui/Primitives'
import { ScrollTrigger, useReducedMotion } from '../../hooks/useSmoothScroll'
import { fmt } from '../../lib/format'
import { cn } from '../../lib/utils'

/**
 * Demo calibration concept, made visible.
 *
 * The animation is the argument. A unitless curve plotted on a metre axis sits
 * as a flat line along the bottom — which is exactly what relative depth is
 * worth before calibration. Scrolling applies the fitted scale and offset and
 * lifts it onto the reference surface. Nothing about that is a metaphor; it is
 * the same arithmetic the pipeline runs.
 */

const STEPS = [
  { label: 'RELATIVE DEPTH', note: 'Unitless, 0–1. No datum, no scale.' },
  { label: 'REFERENCE DEM', note: 'External elevation that already carries metres.' },
  { label: 'SCALE + OFFSET', note: 'Least-squares fit between the two.' },
  { label: 'METRIC ELEVATION', note: 'The relative surface, now in metres.' },
]

export function CalibrationSection() {
  const scene = useSceneStore((s) => s.scene)
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const [t, setT] = useState(0)
  const reduced = useReducedMotion()

  const data = useMemo(() => {
    if (!scene?.reference) return null
    const { depth, dsm, reference } = scene
    const a: [number, number] = [0.05, 0.62]
    const b: [number, number] = [0.95, 0.3]
    const samples = 140
    return {
      relative: transect(depth.data, depth.width, a, b, samples),
      referenceProfile: transect(reference.grid, dsm.size, a, b, samples),
      dsmProfile: transect(dsm.heights, dsm.size, a, b, samples),
      scale: dsm.calibration.scale.value,
      offset: dsm.calibration.offset.value,
    }
  }, [scene])

  useLayoutEffect(() => {
    const el = wrapperRef.current
    if (!el) return
    if (reduced) {
      setT(1)
      return
    }
    const trigger = ScrollTrigger.create({
      trigger: el,
      start: 'top 78%',
      end: 'bottom 62%',
      scrub: 0.7,
      onUpdate: (self) => setT(self.progress),
    })
    return () => trigger.kill()
  }, [reduced])

  if (!scene || !data) {
    return <Section id="calibration" className="min-h-[40vh] bg-void" />
  }

  const activeStep = t < 0.22 ? 0 : t < 0.45 ? 1 : t < 0.78 ? 2 : 3

  /* --------------------------------------------------------------- plot */

  const width = 720
  const height = 300
  const pad = { l: 46, r: 14, t: 16, b: 26 }
  const plotW = width - pad.l - pad.r
  const plotH = height - pad.t - pad.b

  const yMin = Math.min(...data.referenceProfile, 0)
  const yMax = Math.max(...data.referenceProfile, ...data.dsmProfile)
  const ySpan = yMax - yMin || 1

  const px = (i: number, n: number) => pad.l + (i / (n - 1)) * plotW
  const py = (v: number) => pad.t + plotH * (1 - (v - yMin) / ySpan)

  const path = (values: number[]) =>
    values.map((v, i) => `${i === 0 ? 'M' : 'L'}${px(i, values.length).toFixed(1)} ${py(v).toFixed(1)}`).join(' ')

  // The transformation itself: raw relative -> fitted metres, interpolated by t.
  const morphed = data.relative.map((r) => {
    const fitted = r * data.scale + data.offset
    return r + (fitted - r) * t
  })

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({
    y: pad.t + plotH * (1 - f),
    label: `${Math.round(yMin + ySpan * f)}`,
  }))

  return (
    <Section id="calibration" className="bg-void py-28 sm:py-36 lg:py-44">
      <div className="mx-auto max-w-[1680px] px-4 sm:px-10 lg:px-16">
        <SectionHeading
          index="10"
          eyebrow="DEMO CALIBRATION CONCEPT"
          title={
            <>
              HOW A FUTURE
              <br />
              PIPELINE COULD SCALE
            </>
          }
          lede="This retained demo visual explains a possible future calibration approach. Uploaded presentation scenes do not use reference elevation, GIS processing or measured scale."
        />

        <div ref={wrapperRef} className="mt-14 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          {/* --------------------------------------------------------- plot */}
          <Panel className="overflow-hidden p-0" ticks>
            <PanelHeader
              title="ALIGNMENT"
              right={
                <div className="flex items-center gap-2">
                  <Tag tone={t > 0.78 ? 'cyan' : 'amber'}>
                    {t > 0.78 ? 'METRIC' : 'RELATIVE'}
                  </Tag>
                </div>
              }
            />

            <div className="p-4 text-ink">
              <svg
                viewBox={`0 0 ${width} ${height}`}
                className="w-full"
                role="img"
                aria-label="Relative depth profile being scaled and offset onto the reference elevation profile"
              >
                <defs>
                  <linearGradient id="dw-cal-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2fe3ff" stopOpacity="0.22" />
                    <stop offset="100%" stopColor="#2fe3ff" stopOpacity="0" />
                  </linearGradient>
                </defs>

                {yTicks.map((tick) => (
                  <g key={tick.label}>
                    <line
                      x1={pad.l}
                      x2={width - pad.r}
                      y1={tick.y}
                      y2={tick.y}
                      stroke="currentColor"
                      className="text-line"
                      strokeDasharray="2 5"
                    />
                    <text
                      x={pad.l - 8}
                      y={tick.y + 3}
                      textAnchor="end"
                      className="fill-current font-mono text-[9px] text-ink-faint"
                    >
                      {tick.label}
                    </text>
                  </g>
                ))}
                <text
                  x={pad.l - 8}
                  y={pad.t - 4}
                  textAnchor="end"
                  className="fill-current font-mono text-[8px] text-ink-faint"
                >
                  m
                </text>

                {/* Reference surface — always in metres. */}
                <path
                  d={path(data.referenceProfile)}
                  fill="none"
                  stroke="#17b3a3"
                  strokeWidth={1.6}
                  strokeDasharray="4 3"
                  opacity={0.5 + 0.5 * Math.min(1, t * 3)}
                />

                {/* The relative curve, being transformed. */}
                <path
                  d={`${path(morphed)} L${pad.l + plotW} ${pad.t + plotH} L${pad.l} ${pad.t + plotH} Z`}
                  fill="url(#dw-cal-fill)"
                  opacity={t}
                />
                <path d={path(morphed)} fill="none" stroke="#2fe3ff" strokeWidth={2} />

                {/* Residual ties, shown while the fit is mid-flight. */}
                {t > 0.25 &&
                  t < 0.95 &&
                  morphed.map((v, i) =>
                    i % 12 === 0 ? (
                      <line
                        key={i}
                        x1={px(i, morphed.length)}
                        x2={px(i, morphed.length)}
                        y1={py(v)}
                        y2={py(data.referenceProfile[i])}
                        stroke="#f0a63c"
                        strokeWidth={1}
                        opacity={0.45 * (1 - t)}
                      />
                    ) : null,
                  )}
              </svg>

              <div className="mt-3 flex flex-wrap items-center gap-5">
                <Legend color="#2fe3ff" label="RELATIVE DEPTH → METRIC" />
                <Legend color="#17b3a3" label="REFERENCE ELEVATION" dashed />
                <span className="dw-label ml-auto">
                  {t < 0.1
                    ? 'UNITLESS — SITS AT ZERO ON A METRE AXIS'
                    : t > 0.9
                      ? 'FITTED'
                      : `APPLYING FIT · ${Math.round(t * 100)}%`}
                </span>
              </div>
            </div>
          </Panel>

          {/* --------------------------------------------------------- steps */}
          <div className="flex flex-col gap-4">
            <Panel className="p-4">
              <div className="dw-label mb-5">TRANSFORM</div>
              <ol className="space-y-0">
                {STEPS.map((s, i) => (
                  <li key={s.label}>
                    <div
                      className={cn(
                        'border-l-2 py-3 pl-4 transition-colors duration-500',
                        i <= activeStep ? 'border-cyan-core' : 'border-line',
                      )}
                    >
                      <div
                        className={cn(
                          'dw-label transition-colors duration-500',
                          i <= activeStep ? 'text-ink' : 'text-ink-faint/60',
                        )}
                      >
                        {s.label}
                      </div>
                      <p
                        className={cn(
                          'mt-1.5 text-[11.5px] leading-relaxed transition-colors duration-500',
                          i <= activeStep ? 'text-ink-dim' : 'text-ink-faint/50',
                        )}
                      >
                        {s.note}
                      </p>
                    </div>
                    {i < STEPS.length - 1 && (
                      <ArrowDown
                        className={cn(
                          'ml-[-9px] size-3.5 transition-colors duration-500',
                          i < activeStep ? 'text-cyan-core' : 'text-line-bright',
                        )}
                      />
                    )}
                  </li>
                ))}
              </ol>
            </Panel>

            <Panel className="p-4">
              <div className="dw-label mb-4">SOLVED PARAMETERS</div>
              <div className="grid grid-cols-2 gap-4">
                <Metric label="Scale" value={scene.dsm.calibration.scale} decimals={1} size="md" />
                <Metric label="Offset" value={scene.dsm.calibration.offset} decimals={1} size="md" />
              </div>
              <div className="dw-rule my-4" />
              <p className="text-[11.5px] leading-relaxed text-ink-dim">
                elevation = {fmt(scene.dsm.calibration.scale.value, 1)} × depth{' '}
                {scene.dsm.calibration.offset.value >= 0 ? '+' : '−'}{' '}
                {fmt(Math.abs(scene.dsm.calibration.offset.value), 1)} m
              </p>
              <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
                Anchor: <span className="text-ink-dim">{scene.dsm.calibration.sourceLabel}</span>.
                Change the anchor and every elevation in this product changes with it — which is
                precisely why the anchor is named on screen rather than buried.
              </p>
            </Panel>
          </div>
        </div>
      </div>
    </Section>
  )
}

function Legend({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <span
        aria-hidden
        className="h-px w-6"
        style={{
          background: dashed
            ? `repeating-linear-gradient(90deg, ${color} 0 4px, transparent 4px 7px)`
            : color,
        }}
      />
      <span className="dw-label">{label}</span>
    </span>
  )
}
