import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GripVertical } from 'lucide-react'
import { useSceneStore } from '../../hooks/useScene'
import { renderEdges, renderSatellite, renderScalar } from '../../lib/raster'
import { getPlate } from '../../lib/plates'
import { contourIntervalFor } from '../terrain/terrainMaterial'
import { sampleGrid, slopeDegAt, uvToLonLat } from '../../lib/terrain'
import { rampToCss } from '../../lib/colormaps'
import { Panel, Section, SectionHeading, Tag } from '../ui/Primitives'
import { InlineValue } from '../ui/Metric'
import { derived, simulated, type Scene } from '../../types'
import { fmtLat, fmtLon } from '../../lib/format'
import { cn } from '../../lib/utils'

type Mode = 'depth' | 'edge' | 'contour'

/**
 * Build (or fetch from cache) one derived plate for a scene. Exported so the
 * boot sequence can warm these before the comparator is ever scrolled to.
 */
export function buildPlate(scene: Scene, kind: Mode): string {
  const { terrain, depth, dsm } = scene
  return getPlate(scene.id, kind, () => {
    if (kind === 'depth') {
      return renderScalar(depth.data, depth.width, { ramp: 'cividis' })
    }
    if (kind === 'edge') {
      return renderEdges(renderSatellite(terrain, { resolution: terrain.size }))
    }
    return renderScalar(dsm.heights, dsm.size, {
      ramp: 'mono',
      contourInterval: contourIntervalFor(terrain.maxElevation - terrain.minElevation),
      contourOpacity: 0.85,
    })
  })
}

const MODES: Array<{ id: Mode; label: string; hint: string }> = [
  { id: 'depth', label: 'DEPTH', hint: 'Relative depth, cividis ramp' },
  { id: 'edge', label: 'EDGE', hint: 'Sobel gradient magnitude' },
  { id: 'contour', label: 'CONTOUR', hint: 'Elevation with metric contours' },
]

/**
 * RGB / derived-product comparator.
 *
 * The divider is deliberately a comparison of the *same* raster rather than two
 * unrelated pictures — the depth plate on the right is computed from the plate
 * on the left, so dragging across shows a transformation instead of a before /
 * after marketing shot.
 */
export function DepthComparator() {
  const scene = useSceneStore((s) => s.scene)
  const [mode, setMode] = useState<Mode>('depth')
  const [split, setSplit] = useState(0.5)
  const [hover, setHover] = useState<{ u: number; v: number } | null>(null)
  const frameRef = useRef<HTMLDivElement | null>(null)
  const draggingRef = useRef(false)

  /* ------------------------------------------------------------- rasters */

  const plates = useMemo(() => {
    if (!scene) return null
    return {
      depth: buildPlate(scene, 'depth'),
      edge: buildPlate(scene, 'edge'),
      contour: buildPlate(scene, 'contour'),
    }
  }, [scene])

  /* --------------------------------------------------------- interaction */

  const positionFromEvent = useCallback((clientX: number) => {
    const el = frameRef.current
    if (!el) return null
    const r = el.getBoundingClientRect()
    return Math.min(1, Math.max(0, (clientX - r.left) / r.width))
  }, [])

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!draggingRef.current) return
      const p = positionFromEvent(e.clientX)
      if (p !== null) setSplit(p)
    }
    const onUp = () => {
      draggingRef.current = false
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [positionFromEvent])

  const onHoverMove = (e: React.PointerEvent) => {
    const el = frameRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setHover({
      u: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      v: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    })
  }

  const readout = useMemo(() => {
    if (!scene || !hover) return null
    const { terrain, depth } = scene
    const relative = sampleGrid(depth.data, depth.width, hover.u, hover.v)
    const elevation = sampleGrid(terrain.heights, terrain.size, hover.u, hover.v)
    const slope = slopeDegAt(terrain.heights, terrain.size, hover.u, hover.v, terrain.extentMeters)
    const [lon, lat] = uvToLonLat(terrain.bounds, hover.u, hover.v)
    const px = Math.round(hover.u * (depth.width - 1))
    const py = Math.round(hover.v * (depth.height - 1))
    return { relative, elevation, slope, lon, lat, px, py }
  }, [scene, hover])

  if (!scene || !plates) {
    return (
      <Section id="compare" className="min-h-[60vh]">
        <div className="dw-grid-bg size-full opacity-20" />
      </Section>
    )
  }

  return (
    <Section id="compare" className="bg-void py-28 sm:py-36 lg:py-44">
      <div className="mx-auto max-w-[1680px] px-4 sm:px-10 lg:px-16">
        <SectionHeading
          index="04"
          eyebrow="INSPECTION"
          title={
            <>
              ONE IMAGE,
              <br />
              FOUR READINGS
            </>
          }
          lede="Drag the divider. The left half is the source raster; the right half is a product derived from it. Nothing here is a stock illustration — every plate is computed in your browser from the loaded scene."
        />

        <div className="mt-14 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          {/* ------------------------------------------------------ viewer */}
          <Panel className="overflow-hidden p-0" ticks>
            <div className="flex h-10 items-center justify-between gap-3 border-b border-line px-3">
              <div className="flex items-center gap-2.5">
                <span className="dw-label text-ink-dim">SCENE</span>
                <span className="dw-value text-[11px] text-ink">{scene.name}</span>
              </div>
              <div className="flex items-center gap-1">
                {MODES.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    title={m.hint}
                    onClick={() => setMode(m.id)}
                    data-cursor="button"
                    className={cn(
                      'rounded-full border px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.16em] transition-colors',
                      mode === m.id
                        ? 'border-cyan-core/50 bg-cyan-core/10 text-cyan-core'
                        : 'border-transparent text-ink-faint hover:text-ink-dim',
                    )}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <div
              ref={frameRef}
              onPointerMove={onHoverMove}
              onPointerLeave={() => setHover(null)}
              data-cursor="crosshair"
              className="dw-scan relative aspect-square w-full select-none overflow-hidden bg-abyss sm:aspect-[4/3]"
            >
              {/* Derived plate underneath */}
              <img
                src={plates[mode]}
                alt={`${mode} product derived from the scene raster`}
                draggable={false}
                className="absolute inset-0 size-full object-cover"
              />
              {/* Source plate clipped to the split */}
              <img
                src={scene.image.url}
                alt="Source RGB raster"
                draggable={false}
                className="absolute inset-0 size-full object-cover"
                style={{ clipPath: `inset(0 ${(1 - split) * 100}% 0 0)` }}
              />

              {/* Labels */}
              <div className="pointer-events-none absolute left-3 top-3">
                <Tag tone="neutral">ORIGINAL RGB</Tag>
              </div>
              <div className="pointer-events-none absolute right-3 top-3">
                <Tag tone="cyan">
                  {mode === 'depth'
                    ? 'RELATIVE DEPTH'
                    : mode === 'edge'
                      ? 'EDGE RESPONSE'
                      : 'ELEVATION + CONTOURS'}
                </Tag>
              </div>

              {/* Divider */}
              <div
                className="absolute inset-y-0 z-10 w-px bg-cyan-core/80 shadow-[0_0_14px_rgba(47,227,255,0.6)]"
                style={{ left: `${split * 100}%` }}
              >
                <button
                  type="button"
                  aria-label="Comparison divider position"
                  aria-valuenow={Math.round(split * 100)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  role="slider"
                  tabIndex={0}
                  onPointerDown={(e) => {
                    e.preventDefault()
                    draggingRef.current = true
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowLeft') setSplit((s) => Math.max(0, s - 0.03))
                    if (e.key === 'ArrowRight') setSplit((s) => Math.min(1, s + 0.03))
                  }}
                  data-cursor="button"
                  className="absolute left-1/2 top-1/2 grid size-9 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize place-items-center border border-cyan-core/60 bg-void/85 backdrop-blur"
                >
                  <GripVertical className="size-4 text-cyan-core" />
                </button>
              </div>

              {/* Hover reticle */}
              {hover && (
                <div
                  aria-hidden
                  className="pointer-events-none absolute z-20"
                  style={{ left: `${hover.u * 100}%`, top: `${hover.v * 100}%` }}
                >
                  <div className="absolute -translate-x-1/2 -translate-y-1/2">
                    <div className="size-5 border border-cyan-core/70" />
                  </div>
                </div>
              )}
            </div>

            {/* Ramp legend */}
            <div className="flex flex-wrap items-center gap-4 border-t border-line px-3 py-2.5">
              <span className="dw-label">
                {mode === 'depth' ? 'RELATIVE DEPTH' : mode === 'contour' ? 'ELEVATION' : 'GRADIENT'}
              </span>
              <div className="flex min-w-[160px] flex-1 items-center gap-2">
                <span className="dw-value text-[10px] text-ink-faint">
                  {mode === 'contour' ? `${scene.terrain.minElevation.toFixed(0)} m` : 'FAR'}
                </span>
                <div
                  className="h-1.5 flex-1"
                  style={{
                    background: rampToCss(
                      mode === 'depth' ? 'cividis' : mode === 'contour' ? 'mono' : 'ice',
                    ),
                  }}
                />
                <span className="dw-value text-[10px] text-ink-faint">
                  {mode === 'contour' ? `${scene.terrain.maxElevation.toFixed(0)} m` : 'NEAR'}
                </span>
              </div>
            </div>
          </Panel>

          {/* ----------------------------------------------------- readout */}
          <div className="flex flex-col gap-4">
            <Panel className="p-4">
              <div className="dw-label mb-4">CURSOR READOUT</div>
              {readout ? (
                <dl className="space-y-3">
                  <Row label="X" value={`${readout.px}`} />
                  <Row label="Y" value={`${readout.py}`} />
                  <div className="dw-rule my-3" />
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="dw-label">RELATIVE DEPTH</dt>
                    <dd>
                      <InlineValue
                        value={simulated(
                          readout.relative,
                          '',
                          'Ground-truth relative depth of the demo scene. Unitless by definition — there is no datum on this axis.',
                        )}
                        decimals={3}
                        className="text-sm text-cyan-core"
                      />
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="dw-label">ELEVATION</dt>
                    <dd>
                      <InlineValue
                        value={simulated(
                          readout.elevation,
                          'm',
                          'Elevation from the demo scene DSM raster.',
                        )}
                        decimals={1}
                        className="text-sm"
                      />
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="dw-label">SLOPE</dt>
                    <dd>
                      <InlineValue
                        value={derived(
                          readout.slope,
                          '°',
                          'Central-difference gradient of the DSM at this cell.',
                        )}
                        decimals={1}
                        className="text-sm"
                      />
                    </dd>
                  </div>
                  <div className="dw-rule my-3" />
                  <Row label="LAT" value={fmtLat(readout.lat)} />
                  <Row label="LON" value={fmtLon(readout.lon)} />
                </dl>
              ) : (
                <p className="text-[12px] leading-relaxed text-ink-faint">
                  Move the pointer over the raster to sample depth, elevation, slope and
                  coordinates at that cell.
                </p>
              )}
            </Panel>

            <Panel className="p-4">
              <div className="dw-label mb-3">WHAT YOU ARE LOOKING AT</div>
              <p className="text-[12px] leading-relaxed text-ink-dim">
                {mode === 'depth' &&
                  'Relative depth: brighter is nearer the sensor. The values have no unit and no reference surface — they describe order, not magnitude.'}
                {mode === 'edge' &&
                  'Sobel gradient magnitude over the source raster. Useful for checking that the depth field respects real scene boundaries rather than inventing smooth blobs.'}
                {mode === 'contour' &&
                  'Calibrated elevation with contour lines at a metric interval. Contours are drawn in elevation space, so their spacing directly encodes slope.'}
              </p>
            </Panel>
          </div>
        </div>
      </div>
    </Section>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="dw-label">{label}</dt>
      <dd className="dw-value text-sm text-ink">{value}</dd>
    </div>
  )
}
