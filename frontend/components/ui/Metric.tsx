import { useId, useState, type ReactNode } from 'react'
import { PROVENANCE_COPY, PROVENANCE_LABEL, type Provenance, type Tagged } from '../../types'
import { useSceneStore } from '../../hooks/useScene'
import { fmt } from '../../lib/format'
import { cn } from '../../lib/utils'

/**
 * The provenance renderer.
 *
 * Every figure in DepthWizard goes through here, and it reads the source tag off
 * the value itself rather than off a prop. That is the whole idea: a developer
 * adding a new panel cannot forget to mark a simulated number, because they
 * never had the option of passing a bare `number` in the first place.
 */

const DOT_COLOR: Record<Provenance, string> = {
  measured: 'bg-cyan-core',
  derived: 'bg-blue-cool',
  reference: 'bg-teal-sub',
  simulated: 'bg-amber-warn',
}

const TEXT_COLOR: Record<Provenance, string> = {
  measured: 'text-cyan-core',
  derived: 'text-blue-cool',
  reference: 'text-teal-sub',
  simulated: 'text-amber-warn',
}

export function ProvenanceDot({ provenance, className }: { provenance: Provenance; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('inline-block size-1.5 shrink-0 rounded-full', DOT_COLOR[provenance], className)}
    />
  )
}

export function ProvenanceLegend({ className }: { className?: string }) {
  const order: Provenance[] = ['measured', 'derived', 'reference', 'simulated']
  return (
    <ul className={cn('flex flex-wrap items-center gap-x-5 gap-y-2', className)}>
      {order.map((p) => (
        <li key={p} className="flex items-center gap-2">
          <ProvenanceDot provenance={p} />
          <span className="dw-label">{PROVENANCE_LABEL[p]}</span>
          <span className="hidden text-[11px] leading-tight text-ink-faint md:inline">
            {PROVENANCE_COPY[p]}
          </span>
        </li>
      ))}
    </ul>
  )
}

function formatValue(value: unknown, decimals: number): string {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '—'
    return fmt(value, decimals)
  }
  if (Array.isArray(value)) return value.map((v) => (typeof v === 'number' ? fmt(v, decimals) : v)).join(', ')
  return String(value)
}

export interface MetricProps {
  label: string
  value: Tagged<unknown>
  decimals?: number
  /** Overrides the unit carried on the value. */
  unit?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
  /** Rendered under the value — a short qualifier, not a paragraph. */
  hint?: ReactNode
}

const SIZE_CLASS = {
  sm: 'text-sm',
  md: 'text-lg',
  lg: 'text-2xl',
  xl: 'text-4xl md:text-5xl',
} as const

export function Metric({ label, value, decimals = 1, unit, size = 'md', className, hint }: MetricProps) {
  const showProvenance = useSceneStore((s) => s.showProvenance)
  const [open, setOpen] = useState(false)
  const id = useId()

  const displayUnit = unit ?? value.unit
  const missing = typeof value.value === 'number' && !Number.isFinite(value.value)

  return (
    <div
      className={cn(
        'group/metric relative',
        showProvenance && 'rounded-md ring-1 ring-inset',
        showProvenance && `ring-current ${TEXT_COLOR[value.provenance]}`,
        showProvenance && 'px-1.5 py-1 -mx-1.5 -my-1',
        className,
      )}
    >
      <div className="flex items-center gap-1.5">
        <span className="dw-label">{label}</span>
        <button
          type="button"
          aria-describedby={open ? id : undefined}
          aria-label={`Source of ${label}: ${PROVENANCE_LABEL[value.provenance]}`}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onClick={() => setOpen((v) => !v)}
          className="rounded-full p-0.5 transition-opacity hover:opacity-100 focus-visible:opacity-100"
        >
          <ProvenanceDot provenance={value.provenance} />
        </button>
        {showProvenance && (
          <span className={cn('dw-label !text-[9px]', TEXT_COLOR[value.provenance])}>
            {PROVENANCE_LABEL[value.provenance]}
          </span>
        )}
      </div>

      <div className={cn('dw-value mt-1.5 flex items-baseline gap-1 text-ink', SIZE_CLASS[size])}>
        <span className={cn(missing && 'text-ink-faint')}>{formatValue(value.value, decimals)}</span>
        {displayUnit && !missing && (
          <span className="text-[0.55em] font-medium tracking-wide text-ink-faint">{displayUnit}</span>
        )}
      </div>

      {hint && <div className="mt-1 text-[11px] leading-snug text-ink-faint">{hint}</div>}

      {open && (
        <div
          id={id}
          role="tooltip"
          className="dw-panel-glass absolute left-0 top-full z-50 mt-2 w-64 p-3 text-[11px] leading-relaxed text-ink-dim"
        >
          <div className="mb-1.5 flex items-center gap-2">
            <ProvenanceDot provenance={value.provenance} />
            <span className={cn('dw-label', TEXT_COLOR[value.provenance])}>
              {PROVENANCE_LABEL[value.provenance]}
            </span>
          </div>
          <p className="m-0">{value.note ?? PROVENANCE_COPY[value.provenance]}</p>
        </div>
      )}
    </div>
  )
}

/** Inline variant for running text and dense HUD rows. */
export function InlineValue({
  value,
  decimals = 1,
  unit,
  className,
}: {
  value: Tagged<unknown>
  decimals?: number
  unit?: string
  className?: string
}) {
  const showProvenance = useSceneStore((s) => s.showProvenance)
  const displayUnit = unit ?? value.unit
  const missing = typeof value.value === 'number' && !Number.isFinite(value.value)
  return (
    <span
      className={cn('dw-value inline-flex items-center gap-1', className)}
      title={value.note ?? PROVENANCE_COPY[value.provenance]}
    >
      <span className={cn(missing && 'text-ink-faint')}>{formatValue(value.value, decimals)}</span>
      {displayUnit && !missing && <span className="text-[0.75em] text-ink-faint">{displayUnit}</span>}
      {showProvenance ? (
        <span className={cn('dw-label !text-[9px]', TEXT_COLOR[value.provenance])}>
          {PROVENANCE_LABEL[value.provenance]}
        </span>
      ) : (
        <ProvenanceDot provenance={value.provenance} className="ml-0.5" />
      )}
    </span>
  )
}
