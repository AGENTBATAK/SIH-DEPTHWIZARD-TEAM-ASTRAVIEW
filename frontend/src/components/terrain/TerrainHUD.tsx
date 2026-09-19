import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Building2, X } from 'lucide-react'
import type { FlythroughReadout, MoveState } from './FlythroughController'
import type { Structure } from '../../types'
import { derived } from '../../types'
import { useSceneStore, type CursorReadout } from '../../hooks/useScene'
import { InlineValue, Metric } from '../ui/Metric'
import { Panel, Tag } from '../ui/Primitives'
import { fmt, fmtBearing, fmtLat, fmtLon } from '../../lib/format'
import { cn } from '../../lib/utils'

/* --------------------------------------------------------- cursor readout */

export function CursorHUD({ cursor }: { cursor: CursorReadout | null }) {
  return (
    <Panel glass className="pointer-events-none w-[200px] p-3">
      <div className="dw-label mb-3">SURFACE READOUT</div>
      {cursor ? (
        <dl className="space-y-2.5">
          <Row label="ELEVATION" value={`${fmt(cursor.elevation, 1)} m`} accent />
          <Row label="SLOPE" value={`${fmt(cursor.slope, 1)}°`} />
          <div className="dw-rule my-2.5" />
          <Row label="LAT" value={fmtLat(cursor.lat)} />
          <Row label="LON" value={fmtLon(cursor.lon)} />
        </dl>
      ) : (
        <p className="text-[11px] leading-relaxed text-ink-faint">
          Point at the terrain to sample elevation, slope and coordinates.
        </p>
      )}
    </Panel>
  )
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="dw-label">{label}</dt>
      <dd className={cn('dw-value text-[11px]', accent ? 'text-cyan-core' : 'text-ink')}>{value}</dd>
    </div>
  )
}

/* ---------------------------------------------------------- flythrough HUD */

export function FlythroughHUD({
  readout,
  onExit,
}: {
  readout: FlythroughReadout | null
  onExit: () => void
}) {
  return (
    <>
      {/* Reticle */}
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="relative size-8">
          <span className="absolute left-1/2 top-0 h-2.5 w-px -translate-x-1/2 bg-cyan-core/60" />
          <span className="absolute bottom-0 left-1/2 h-2.5 w-px -translate-x-1/2 bg-cyan-core/60" />
          <span className="absolute left-0 top-1/2 h-px w-2.5 -translate-y-1/2 bg-cyan-core/60" />
          <span className="absolute right-0 top-1/2 h-px w-2.5 -translate-y-1/2 bg-cyan-core/60" />
          <span className="absolute left-1/2 top-1/2 size-0.5 -translate-x-1/2 -translate-y-1/2 bg-cyan-core" />
        </div>
      </div>

      {/* Instrument strip */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 border-t border-line bg-void/72 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-8 gap-y-3 px-5 py-3">
          <Gauge label="ALT" value={readout ? `${fmt(readout.altitude, 0)}` : '—'} unit="m" accent />
          <Gauge label="AGL" value={readout ? `${fmt(readout.agl, 0)}` : '—'} unit="m" />
          <Gauge label="SLOPE" value={readout ? `${fmt(readout.slope, 1)}` : '—'} unit="°" />
          <Gauge label="HEADING" value={readout ? fmtBearing(readout.heading) : '—'} unit="" />
          <Gauge label="SPEED" value={readout ? `${fmt(readout.speed, 0)}` : '—'} unit="m/s" />
          <Gauge label="LAT" value={readout ? readout.lat.toFixed(4) : '—'} unit="" />
          <Gauge label="LON" value={readout ? readout.lon.toFixed(4) : '—'} unit="" />
          <button
            type="button"
            onClick={onExit}
            className="pointer-events-auto flex items-center gap-2 border border-line-bright px-2.5 py-1.5 transition-colors hover:border-amber-warn/60 hover:text-amber-warn"
          >
            <X className="size-3" />
            <span className="dw-label text-current">EXIT · ESC</span>
          </button>
        </div>
      </div>

      {/* Key hints */}
      <div className="pointer-events-none absolute left-5 top-20 hidden lg:block">
        <Panel glass className="p-3">
          <div className="dw-label mb-2.5">CONTROLS</div>
          <dl className="space-y-1.5">
            {[
              ['W A S D', 'Move'],
              ['MOUSE', 'Look'],
              ['SPACE / C', 'Climb / descend'],
              ['RIGHT SHIFT', 'Boost'],
              ['ESC', 'Exit'],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-4">
                <dt className="dw-value text-[10px] text-cyan-core">{k}</dt>
                <dd className="dw-label">{v}</dd>
              </div>
            ))}
          </dl>
        </Panel>
      </div>
    </>
  )
}

function Gauge({
  label,
  value,
  unit,
  accent,
}: {
  label: string
  value: string
  unit: string
  accent?: boolean
}) {
  return (
    <div className="min-w-[62px]">
      <div className="dw-label mb-1">{label}</div>
      <div className={cn('dw-value flex items-baseline gap-1 text-sm', accent ? 'text-cyan-core' : 'text-ink')}>
        <span className="tabular">{value}</span>
        {unit && <span className="text-[9px] text-ink-faint">{unit}</span>}
      </div>
    </div>
  )
}

/* --------------------------------------------------------- touch controls */

/**
 * On-screen movement pad for touch devices, writing into the same shared move
 * state the keyboard uses so the controller has a single input path.
 */
export function TouchControls({ moveRef }: { moveRef: React.MutableRefObject<MoveState> }) {
  const set = (patch: Partial<MoveState>) => {
    moveRef.current = { ...moveRef.current, ...patch }
  }

  const pad = (
    label: string,
    icon: React.ReactNode,
    onStart: () => void,
    onEnd: () => void,
  ) => (
    <button
      key={label}
      type="button"
      aria-label={label}
      onPointerDown={(e) => {
        e.preventDefault()
        onStart()
      }}
      onPointerUp={onEnd}
      onPointerLeave={onEnd}
      onPointerCancel={onEnd}
      className="grid size-12 place-items-center border border-line-bright bg-void/70 text-ink-dim backdrop-blur active:border-cyan-core active:text-cyan-core"
    >
      {icon}
    </button>
  )

  return (
    <div className="pointer-events-auto absolute inset-x-0 bottom-24 flex items-end justify-between px-5 lg:hidden">
      <div className="grid grid-cols-3 grid-rows-2 gap-1.5">
        <span />
        {pad('Forward', <ArrowUp className="size-4" />, () => set({ forward: 1 }), () => set({ forward: 0 }))}
        <span />
        {pad('Left', <ArrowLeft className="size-4" />, () => set({ right: -1 }), () => set({ right: 0 }))}
        {pad('Back', <ArrowDown className="size-4" />, () => set({ forward: -1 }), () => set({ forward: 0 }))}
        {pad('Right', <ArrowRight className="size-4" />, () => set({ right: 1 }), () => set({ right: 0 }))}
      </div>
      <div className="flex flex-col gap-1.5">
        {pad('Climb', <span className="dw-label text-current">UP</span>, () => set({ up: 1 }), () => set({ up: 0 }))}
        {pad('Descend', <span className="dw-label text-current">DN</span>, () => set({ up: -1 }), () => set({ up: 0 }))}
      </div>
    </div>
  )
}

/* --------------------------------------------------------- structure card */

export function StructureCard({ structure }: { structure: Structure }) {
  const selectStructure = useSceneStore((s) => s.selectStructure)
  const scene = useSceneStore((s) => s.scene)
  const isDemo = scene?.source === 'demo'

  return (
    <Panel glass className="w-[248px] p-0">
      <div className="flex h-9 items-center justify-between border-b border-line px-3">
        <div className="flex items-center gap-2">
          <Building2 className="size-3 text-cyan-core" />
          <span className="dw-label text-ink-dim">{structure.label}</span>
        </div>
        <button
          type="button"
          onClick={() => selectStructure(null)}
          aria-label="Close structure panel"
          className="text-ink-faint transition-colors hover:text-ink"
        >
          <X className="size-3.5" />
        </button>
      </div>

      <div className="space-y-4 p-3">
        <Metric label="Est. height" value={structure.height} decimals={1} size="lg" />

        <div className="grid grid-cols-2 gap-3">
          <Metric label="Base elev." value={structure.baseElevation} decimals={1} size="sm" />
          <Metric label="Top elev." value={structure.topElevation} decimals={1} size="sm" />
        </div>

        <div className="dw-rule" />

        <div className="flex items-baseline justify-between gap-2">
          <span className="dw-label">FOOTPRINT</span>
          <span className="dw-value text-[11px] text-ink">
            <InlineValue
              value={derived(
                structure.fw * (scene?.terrain.extentMeters ?? 4096),
                'm',
                'Footprint width in ground units, from the raster.',
              )}
              decimals={0}
            />
          </span>
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="dw-label">CONFIDENCE</span>
          {isDemo ? <Tag tone="amber">DEMO</Tag> : <Tag tone="cyan">DERIVED</Tag>}
        </div>

        <p className="text-[10px] leading-relaxed text-ink-faint">
          {isDemo
            ? 'This structure belongs to the generated demo scene. Its height is exact by construction, not an estimate of any real building.'
            : 'Height is the difference between the surface and surrounding ground in the loaded raster. Uploaded presentation scenes use synthetic terrain, so this is illustrative.'}
        </p>
      </div>
    </Panel>
  )
}
