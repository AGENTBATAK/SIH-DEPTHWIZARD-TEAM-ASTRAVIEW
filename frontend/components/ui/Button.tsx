import { forwardRef, useCallback, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { gsap } from 'gsap'
import { cn } from '../../lib/utils'
import { useReducedMotion } from '../../hooks/useSmoothScroll'

type Variant = 'primary' | 'ghost' | 'outline' | 'danger'
type Size = 'sm' | 'md' | 'lg'

const VARIANT: Record<Variant, string> = {
  primary:
    'bg-cyan-core/12 text-cyan-core border-cyan-core/35 hover:bg-cyan-core/20 hover:border-cyan-core/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_20px_40px_-28px_rgba(47,227,255,0.55)]',
  outline:
    'bg-white/[0.035] text-ink border-hair-bright hover:bg-white/[0.07] hover:border-cyan-core/45 shadow-[inset_0_1px_0_rgba(255,255,255,0.09)]',
  ghost: 'bg-transparent text-ink-dim border-transparent hover:text-ink hover:bg-white/[0.05]',
  danger:
    'bg-amber-warn/12 text-amber-warn border-amber-warn/35 hover:bg-amber-warn/20 hover:border-amber-warn/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]',
}

/** Outer padding is asymmetric when a nested icon is present: the icon disc
 *  must sit flush with the inner edge rather than floating off it. */
const SIZE: Record<Size, { base: string; nested: string; disc: string }> = {
  sm: { base: 'h-9 px-4 text-[10px] tracking-[0.16em]', nested: 'pl-4 pr-1', disc: 'size-7' },
  md: { base: 'h-12 px-6 text-[11px] tracking-[0.18em]', nested: 'pl-6 pr-1.5', disc: 'size-9' },
  lg: { base: 'h-14 px-8 text-[11px] tracking-[0.2em]', nested: 'pl-8 pr-2', disc: 'size-10' },
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  /** Cursor-following translate. Disabled automatically for reduced motion. */
  magnetic?: boolean
  icon?: ReactNode
  /** Rendered inside its own circular enclosure, flush with the right padding. */
  trailing?: ReactNode
}

/**
 * Magnetic pill button.
 *
 * Two things carry the weight here. The magnetic pull is capped at a few pixels
 * and eased out on leave — enough to feel responsive under the cursor, not
 * enough to make the control feel like it is dodging the pointer. And a trailing
 * icon is never naked next to the label: it gets its own circular enclosure set
 * flush into the pill's right edge, so the control reads as an object containing
 * another object rather than a row of glyphs.
 *
 * Touch devices and reduced-motion users get a plain button.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'outline', size = 'md', magnetic = true, icon, trailing, className, children, ...rest },
  forwardedRef,
) {
  const localRef = useRef<HTMLButtonElement | null>(null)
  const labelRef = useRef<HTMLSpanElement | null>(null)
  const reduced = useReducedMotion()
  const active = magnetic && !reduced
  const sizing = SIZE[size]

  const setRefs = useCallback(
    (node: HTMLButtonElement | null) => {
      localRef.current = node
      if (typeof forwardedRef === 'function') forwardedRef(node)
      else if (forwardedRef) forwardedRef.current = node
    },
    [forwardedRef],
  )

  const onMove = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      if (!active || !localRef.current) return
      const r = localRef.current.getBoundingClientRect()
      const dx = e.clientX - (r.left + r.width / 2)
      const dy = e.clientY - (r.top + r.height / 2)
      const strength = 0.22
      gsap.to(localRef.current, {
        x: gsap.utils.clamp(-10, 10, dx * strength),
        y: gsap.utils.clamp(-6, 6, dy * strength),
        duration: 0.5,
        ease: 'power3.out',
      })
      gsap.to(labelRef.current, {
        x: gsap.utils.clamp(-4, 4, dx * strength * 0.4),
        duration: 0.6,
        ease: 'power3.out',
      })
      localRef.current.style.setProperty('--mx', `${e.clientX - r.left}px`)
      localRef.current.style.setProperty('--my', `${e.clientY - r.top}px`)
    },
    [active],
  )

  const onLeave = useCallback(() => {
    if (!active) return
    gsap.to([localRef.current, labelRef.current], {
      x: 0,
      y: 0,
      duration: 0.7,
      ease: 'elastic.out(1, 0.6)',
    })
  }, [active])

  return (
    <button
      ref={setRefs}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      data-cursor="button"
      className={cn(
        'dw-magnetic group relative inline-flex items-center justify-center gap-2.5 overflow-hidden',
        'rounded-full border font-mono font-medium uppercase',
        'transition-[background-color,border-color,box-shadow,transform] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]',
        'active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40',
        VARIANT[variant],
        sizing.base,
        trailing && sizing.nested,
        className,
      )}
      {...rest}
    >
      {/* Directional sweep on hover. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-current to-transparent opacity-[0.12] transition-transform duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-full"
      />
      {icon && <span className="relative shrink-0 opacity-80">{icon}</span>}
      <span ref={labelRef} className="relative whitespace-nowrap">
        {children}
      </span>
      {trailing && (
        <span
          aria-hidden
          className={cn(
            'relative grid shrink-0 place-items-center rounded-full',
            'border border-white/10 bg-white/[0.09] text-current',
            'transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]',
            'group-hover:translate-x-1 group-hover:-translate-y-px group-hover:scale-105',
            sizing.disc,
          )}
        >
          {trailing}
        </span>
      )}
    </button>
  )
})
