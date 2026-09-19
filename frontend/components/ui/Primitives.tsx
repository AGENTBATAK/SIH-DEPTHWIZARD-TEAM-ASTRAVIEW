import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { cn } from '../../lib/utils'
import { useReducedMotion } from '../../hooks/useSmoothScroll'
import { fmt, fmtInt } from '../../lib/format'

/* ------------------------------------------------------------------ bezel */

/**
 * Double-bezel enclosure.
 *
 * A tray holding a plate. The 6px gap between the two is doing all the work:
 * without it you have a card with a border, with it you have one object resting
 * inside another. `size="sm"` tightens both radii and the gap for controls.
 *
 * `inner` styles the plate — pass padding and layout there, not on the wrapper,
 * or the gap collapses.
 */
export function Bezel({
  children,
  className,
  inner,
  size = 'md',
  glow = false,
  ...rest
}: HTMLAttributes<HTMLDivElement> & {
  inner?: string
  size?: 'sm' | 'md'
  /** Cursor-tracked light along the plate edge. */
  glow?: boolean
}) {
  const ref = useRef<HTMLDivElement | null>(null)

  const onMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const el = ref.current
      if (!el || !glow) return
      const r = el.getBoundingClientRect()
      el.style.setProperty('--mx', `${e.clientX - r.left}px`)
      el.style.setProperty('--my', `${e.clientY - r.top}px`)
    },
    [glow],
  )

  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      className={cn('dw-shell', size === 'sm' && 'dw-shell-sm', className)}
      {...rest}
    >
      <div className={cn('dw-core h-full', glow && 'dw-lightborder', inner)}>{children}</div>
    </div>
  )
}

/* ------------------------------------------------------------------ panel */

export function Panel({
  children,
  className,
  glass,
  ticks,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { glass?: boolean; ticks?: boolean }) {
  return (
    <div
      className={cn(glass ? 'dw-panel-glass' : 'dw-panel', ticks && 'dw-ticks', className)}
      {...rest}
    >
      {children}
    </div>
  )
}

export function PanelHeader({
  title,
  right,
  className,
}: {
  title: string
  right?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex h-11 items-center justify-between gap-3 border-b border-white/[0.06] px-5',
        className,
      )}
    >
      <span className="dw-label text-ink-dim">{title}</span>
      {right}
    </div>
  )
}

/* -------------------------------------------------------------------- tag */

export function Tag({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode
  tone?: 'neutral' | 'cyan' | 'amber' | 'teal'
  className?: string
}) {
  const tones = {
    neutral: 'border-hair-bright bg-white/[0.035] text-ink-faint',
    cyan: 'border-cyan-core/40 text-cyan-core bg-cyan-core/[0.09]',
    amber: 'border-amber-warn/40 text-amber-warn bg-amber-warn/[0.09]',
    teal: 'border-teal-sub/40 text-teal-sub bg-teal-sub/[0.09]',
  }
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-[5px] font-mono text-[9px] uppercase leading-none tracking-[0.18em]',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

/* ---------------------------------------------------------------- section */

export function SectionHeading({
  index,
  eyebrow,
  title,
  lede,
  align = 'left',
  className,
}: {
  index?: string
  eyebrow?: string
  title: ReactNode
  lede?: ReactNode
  align?: 'left' | 'center'
  className?: string
}) {
  return (
    <div className={cn('max-w-3xl', align === 'center' && 'mx-auto text-center', className)}>
      {(index || eyebrow) && (
        <div className={cn('mb-7 flex', align === 'center' && 'justify-center')}>
          {/* Eyebrow pill. Index and label share one enclosure so the pair reads
              as a single tag rather than two floating captions. */}
          <span className="dw-eyebrow">
            {index && <span className="text-cyan-core">{index}</span>}
            {index && eyebrow && <span aria-hidden className="h-2.5 w-px bg-white/15" />}
            {eyebrow}
          </span>
        </div>
      )}
      <h2 className="font-display text-[clamp(2.25rem,5.4vw,4.25rem)] font-medium leading-[0.96] tracking-[-0.035em] text-ink">
        {title}
      </h2>
      {lede && (
        <p
          className={cn(
            'mt-6 max-w-2xl text-[15px] leading-relaxed text-ink-dim',
            align === 'center' && 'mx-auto',
          )}
        >
          {lede}
        </p>
      )}
    </div>
  )
}

export function Section({
  id,
  children,
  className,
  ...rest
}: HTMLAttributes<HTMLElement> & { id: string }) {
  return (
    <section id={id} className={cn('relative', className)} {...rest}>
      {children}
    </section>
  )
}

/* ----------------------------------------------------------------- toggle */

export function Toggle({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  hint?: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      data-cursor="button"
      className={cn(
        'group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition-colors',
        'hover:bg-white/[0.03] disabled:pointer-events-none disabled:opacity-40',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'flex size-3.5 shrink-0 items-center justify-center rounded-[5px] border transition-colors',
          checked ? 'border-cyan-core bg-cyan-core/20' : 'border-line-bright bg-transparent',
        )}
      >
        {checked && <span className="size-1.5 rounded-full bg-cyan-core" />}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'dw-label block transition-colors',
            checked ? 'text-ink' : 'text-ink-faint',
          )}
        >
          {label}
        </span>
        {hint && <span className="mt-1 block text-[10px] leading-tight text-ink-faint">{hint}</span>}
      </span>
    </button>
  )
}

/* ----------------------------------------------------------------- slider */

export function Slider({
  value,
  min,
  max,
  step = 0.1,
  onChange,
  label,
  format = (v: number) => fmt(v, 1),
  marks,
}: {
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
  label: string
  format?: (v: number) => string
  marks?: number[]
}) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div className="w-full">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="dw-label">{label}</span>
        <span className="dw-value text-xs text-cyan-core">{format(value)}</span>
      </div>
      <div className="relative">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-label={label}
          onChange={(e) => onChange(Number(e.target.value))}
          className="peer relative z-10 h-4 w-full cursor-pointer appearance-none bg-transparent
            [&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:appearance-none
            [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border
            [&::-webkit-slider-thumb]:border-cyan-core [&::-webkit-slider-thumb]:bg-void
            [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(47,227,255,0.55)]
            [&::-moz-range-thumb]:size-3 [&::-moz-range-thumb]:rounded-full
            [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-cyan-core
            [&::-moz-range-thumb]:bg-void"
        />
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line-bright">
          <div className="h-px bg-cyan-core" style={{ width: `${pct}%` }} />
        </div>
      </div>
      {marks && (
        <div className="mt-1.5 flex justify-between">
          {marks.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onChange(m)}
              className="dw-label transition-colors hover:text-cyan-core"
            >
              {format(m)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ---------------------------------------------------------------- counter */

/**
 * Count-up readout. Counts once when scrolled into view, then holds — a number
 * that re-animates every time it scrolls past reads as decoration rather than data.
 */
export function Counter({
  to,
  decimals = 0,
  duration = 1.6,
  className,
  prefix = '',
  suffix = '',
}: {
  to: number
  decimals?: number
  duration?: number
  className?: string
  prefix?: string
  suffix?: string
}) {
  const ref = useRef<HTMLSpanElement | null>(null)
  const reduced = useReducedMotion()

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const render = (v: number) => {
      el.textContent = `${prefix}${decimals > 0 ? fmt(v, decimals) : fmtInt(v)}${suffix}`
    }
    if (reduced || !Number.isFinite(to)) {
      render(to)
      return
    }
    const obj = { v: 0 }
    render(0)
    const tween = gsap.to(obj, {
      v: to,
      duration,
      ease: 'expo.out',
      onUpdate: () => render(obj.v),
      scrollTrigger: { trigger: el, start: 'top 92%', once: true },
    })
    return () => {
      tween.scrollTrigger?.kill()
      tween.kill()
    }
  }, [to, decimals, duration, prefix, suffix, reduced])

  return <span ref={ref} className={cn('dw-value tabular', className)} />
}

/* ----------------------------------------------------------------- reveal */

/**
 * Scroll entry. A heavy fade-up that resolves out of focus — the blur is what
 * separates "arrives with mass" from "fades in". Transform and filter only; no
 * layout property is touched, so this composites on the GPU.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  y = 56,
  blur = 10,
  as: Tag = 'div',
}: {
  children: ReactNode
  className?: string
  delay?: number
  y?: number
  blur?: number
  as?: 'div' | 'li' | 'section' | 'article'
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const reduced = useReducedMotion()

  useEffect(() => {
    const el = ref.current
    if (!el || reduced) return
    const tween = gsap.fromTo(
      el,
      { opacity: 0, y, filter: blur ? `blur(${blur}px)` : 'none' },
      {
        opacity: 1,
        y: 0,
        filter: 'blur(0px)',
        duration: 1.25,
        delay,
        ease: 'expo.out',
        clearProps: 'filter',
        scrollTrigger: { trigger: el, start: 'top 88%', once: true },
      },
    )
    return () => {
      tween.scrollTrigger?.kill()
      tween.kill()
    }
  }, [delay, y, blur, reduced])

  return (
    <Tag ref={ref as never} className={className}>
      {children}
    </Tag>
  )
}

/* ------------------------------------------------------- cursor-lit card */

export function LitCard({
  children,
  className,
  inner,
  tilt = false,
  bezel = false,
  ...rest
}: HTMLAttributes<HTMLDivElement> & {
  tilt?: boolean
  /** Wrap the content in a nested plate. `className` then styles the tray and
   *  `inner` the plate — put padding on `inner`, or the gap collapses. */
  bezel?: boolean
  inner?: string
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const reduced = useReducedMotion()

  const onMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const el = ref.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const mx = e.clientX - r.left
      const my = e.clientY - r.top
      el.style.setProperty('--mx', `${mx}px`)
      el.style.setProperty('--my', `${my}px`)
      if (tilt && !reduced) {
        gsap.to(el, {
          rotateY: ((mx / r.width) * 2 - 1) * 2.6,
          rotateX: -((my / r.height) * 2 - 1) * 2.2,
          transformPerspective: 900,
          duration: 0.6,
          ease: 'power3.out',
        })
      }
    },
    [tilt, reduced],
  )

  const onLeave = useCallback(() => {
    if (!tilt || reduced || !ref.current) return
    gsap.to(ref.current, { rotateX: 0, rotateY: 0, duration: 0.9, ease: 'expo.out' })
  }, [tilt, reduced])

  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      className={cn(
        bezel ? 'dw-shell dw-lightborder' : 'dw-panel dw-lightborder',
        'transition-[background-color,border-color,transform] duration-700 ease-[cubic-bezier(0.32,0.72,0,1)]',
        className,
      )}
      {...rest}
    >
      {bezel ? <div className={cn('dw-core h-full', inner)}>{children}</div> : children}
    </div>
  )
}

/* -------------------------------------------------------- media utilities */

/** True once the element has been in view at least once. Used for lazy 3D mounts. */
export function useInView<T extends HTMLElement>(rootMargin = '200px') {
  const ref = useRef<T | null>(null)
  const [seen, setSeen] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el || seen) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true)
          io.disconnect()
        }
      },
      { rootMargin },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [seen, rootMargin])

  return [ref, seen] as const
}

/** Tracks current proximity, allowing expensive canvases to unmount again. */
export function useVisibility<T extends HTMLElement>(rootMargin = '200px') {
  const ref = useRef<T | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { rootMargin },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [rootMargin])

  return [ref, visible] as const
}

export { ScrollTrigger }
