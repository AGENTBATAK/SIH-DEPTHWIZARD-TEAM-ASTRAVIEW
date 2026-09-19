import { Layers, Palette, Ruler, Sparkles } from 'lucide-react'
import { useSceneStore, type LayerState } from '../../hooks/useScene'
import { Panel, PanelHeader, Slider, Toggle } from '../ui/Primitives'
import { RAMP_LABELS, rampToCss, type RampName } from '../../lib/colormaps'
import { contourIntervalFor } from './terrainMaterial'
import { cn } from '../../lib/utils'

const LAYER_ROWS: Array<{ key: keyof LayerState; label: string; hint?: string }> = [
  { key: 'texture', label: 'RGB TEXTURE', hint: 'Source imagery draped on the surface' },
  { key: 'elevation', label: 'ELEVATION', hint: 'Hypsometric colour by height' },
  { key: 'contours', label: 'CONTOURS', hint: 'Lines at a metric interval' },
  { key: 'grid', label: 'GRATICULE', hint: 'Coordinate grid overlay' },
  { key: 'wireframe', label: 'WIRE', hint: 'Triangulation overlay' },
  { key: 'structures', label: 'STRUCTURES', hint: 'Detected building nodes' },
  { key: 'referenceDem', label: 'REFERENCE DEM', hint: 'Show the anchor surface instead' },
]

const RAMPS: RampName[] = ['hypsometric', 'cividis', 'ice', 'mono']

/**
 * Layer and render controls.
 *
 * The exaggeration slider is labelled with its true meaning: 1× is the real
 * vertical scale. Terrain visualisations very often ship exaggerated by default
 * with no indication, which quietly misrepresents relief — here the multiplier
 * is always on screen.
 */
export function TerrainControls({ compact, className }: { compact?: boolean; className?: string }) {
  const layers = useSceneStore((s) => s.layers)
  const toggleLayer = useSceneStore((s) => s.toggleLayer)
  const exaggeration = useSceneStore((s) => s.exaggeration)
  const setExaggeration = useSceneStore((s) => s.setExaggeration)
  const ramp = useSceneStore((s) => s.ramp)
  const setRamp = useSceneStore((s) => s.setRamp)
  const scene = useSceneStore((s) => s.scene)

  const interval = scene
    ? contourIntervalFor(scene.terrain.maxElevation - scene.terrain.minElevation)
    : 10

  return (
    <Panel className={cn('flex w-full flex-col overflow-hidden p-0', className)} glass>
      <PanelHeader
        title="LAYER CONTROLS"
        right={<Layers className="size-3.5 text-ink-faint" />}
      />

      {/* The panel is height-bounded by its container; scrolling lives here so it
          can never grow past the viewport and cover the readouts below it. */}
      <div data-lenis-prevent className={cn('min-h-0 flex-1 overflow-y-auto p-3', compact && 'text-[13px]')}>
        <div className="space-y-0.5">
          {LAYER_ROWS.map((row) => (
            <Toggle
              key={row.key}
              label={row.label}
              hint={row.hint}
              checked={layers[row.key]}
              onChange={() => toggleLayer(row.key)}
              disabled={row.key === 'referenceDem' && !scene}
            />
          ))}
        </div>

        <div className="dw-rule my-4" />

        <div className="px-2">
          <Slider
            label="VERTICAL EXAGGERATION"
            value={exaggeration}
            min={0.5}
            max={5}
            step={0.1}
            marks={[0.5, 1, 2, 5]}
            format={(v) => `${v.toFixed(1)}×`}
            onChange={setExaggeration}
          />
          <p className="mt-2 text-[10px] leading-snug text-ink-faint">
            1.0× is true vertical scale. Anything above it exaggerates relief.
          </p>
        </div>

        <div className="dw-rule my-4" />

        <div className="px-2">
          <div className="mb-2 flex items-center gap-2">
            <Palette className="size-3 text-ink-faint" />
            <span className="dw-label">ELEVATION RAMP</span>
          </div>
          <div className="space-y-1.5">
            {RAMPS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRamp(r)}
                data-cursor="button"
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-1.5 transition-colors',
                  ramp === r
                    ? 'border-cyan-core/50 bg-cyan-core/[0.07]'
                    : 'border-transparent hover:bg-white/[0.03]',
                )}
              >
                <span
                  aria-hidden
                  className="h-2.5 w-12 shrink-0 rounded-full"
                  style={{ background: rampToCss(r) }}
                />
                <span className={cn('dw-label', ramp === r ? 'text-ink' : 'text-ink-faint')}>
                  {RAMP_LABELS[r]}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="dw-rule my-4" />

        <dl className="space-y-2 px-2">
          <div className="flex items-center justify-between gap-2">
            <dt className="dw-label">
              <Ruler className="mr-1.5 inline size-2.5" />
              CONTOUR INTERVAL
            </dt>
            <dd className="dw-value text-[11px] text-ink">{interval} m</dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="dw-label">
              <Sparkles className="mr-1.5 inline size-2.5" />
              GRID RESOLUTION
            </dt>
            <dd className="dw-value text-[11px] text-ink">
              {scene ? `${scene.terrain.size}²` : '—'}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="dw-label">GROUND SAMPLE</dt>
            <dd className="dw-value text-[11px] text-ink">
              {scene ? `${(scene.terrain.extentMeters / scene.terrain.size).toFixed(1)} m/px` : '—'}
            </dd>
          </div>
        </dl>
      </div>
    </Panel>
  )
}
