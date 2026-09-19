import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowUpRight, ScanEye } from 'lucide-react'
import { Button } from '../ui/Button'
import { useSceneStore } from '../../hooks/useScene'
import { getLenis, scrollToSection } from '../../hooks/useSmoothScroll'
import { cn } from '../../lib/utils'

const LINKS = [
  { label: 'Platform', id: 'why' },
  { label: 'Workflow', id: 'workflow' },
  { label: '3D Explorer', id: 'explorer' },
  { label: 'Research', id: 'research' },
] as const

/**
 * Fluid island navigation.
 *
 * The header is a detached glass pill rather than a bar welded to the top edge:
 * it floats in the margin, so the page reads as content the chrome is sitting
 * over rather than content pushed down by chrome. On scroll it settles — a
 * transform-only contraction, never a height animation — and the read progress
 * is drawn along the pill's own bottom edge instead of as a separate strip.
 *
 * The mobile menu is a full-viewport glass expansion whose links arrive on a
 * stagger, each sliding up out of an overflow-clipped mask.
 */
export function Nav() {
  const [scrolled, setScrolled] = useState(false)
  const [active, setActive] = useState<string>('hero')
  const [menuOpen, setMenuOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const showProvenance = useSceneStore((s) => s.showProvenance)
  const toggleProvenance = useSceneStore((s) => s.toggleProvenance)
  /* The header only needs a compact state, not continuous scroll position.
     IntersectionObserver keeps it off the scroll hot path. */
  useEffect(() => {
    const hero = document.getElementById('hero')
    if (!hero) return
    const observer = new IntersectionObserver(
      ([entry]) => setScrolled(!entry.isIntersecting),
      { threshold: 0, rootMargin: '-40px 0px 0px 0px' },
    )
    observer.observe(hero)
    return () => observer.disconnect()
  }, [])

  /* Active section, from an observer rather than scroll maths. */
  useEffect(() => {
    const ids = ['hero', ...LINKS.map((l) => l.id), 'research']
    const elements = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => Boolean(el))
    if (!elements.length) return

    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        if (visible) setActive(visible.target.id)
      },
      { rootMargin: '-45% 0px -45% 0px', threshold: [0, 0.25, 0.5, 1] },
    )
    elements.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [location.pathname])

  /* Freeze the page behind the expanded menu. Lenis owns scrolling, so the
     native overflow lock alone would not hold it. */
  useEffect(() => {
    if (!menuOpen) return
    const lenis = getLenis()
    lenis?.stop()
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', onKey)

    return () => {
      lenis?.start()
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  const onNav = (id: string) => {
    setMenuOpen(false)
    if (location.pathname !== '/') {
      navigate('/', { state: { scrollTo: id } })
      return
    }
    scrollToSection(id)
  }

  return (
    <>
      <header className="pointer-events-none fixed inset-x-0 top-0 z-[100] flex justify-center px-4 pt-5 sm:pt-6">
        <div
          className={cn(
            'pointer-events-auto relative flex w-full max-w-[1180px] items-center gap-2 overflow-hidden',
            'rounded-full border p-1.5 pl-4 sm:gap-4 sm:pl-5',
            'transition-[transform,background-color,border-color,box-shadow] duration-700 ease-[cubic-bezier(0.32,0.72,0,1)]',
            'backdrop-blur-xl',
            scrolled
              ? 'scale-[0.985] border-hair-bright bg-abyss/78 shadow-[inset_0_1px_0_rgba(255,255,255,0.09),0_30px_70px_-50px_rgba(0,0,0,0.95)]'
              : 'scale-100 border-hair bg-abyss/45 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]',
          )}
        >
          {/* Wordmark */}
          <Link
            to="/"
            className="group flex shrink-0 items-center gap-2.5"
            onClick={(e) => {
              if (location.pathname === '/') {
                e.preventDefault()
                scrollToSection('hero')
              }
            }}
          >
            <span
              aria-hidden
              className="grid size-6 place-items-center rounded-full border border-cyan-core/35 bg-cyan-core/10 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:scale-110"
            >
              <span className="size-1.5 rounded-full bg-cyan-core shadow-[0_0_8px_rgba(47,227,255,0.9)]" />
            </span>
            <span className="font-display text-[13px] font-medium tracking-[0.16em] text-ink">
              DEPTHWIZARD
            </span>
          </Link>

          {/* Desktop links */}
          <nav className="ml-2 hidden items-center gap-0.5 lg:flex" aria-label="Sections">
            {LINKS.map((link) => (
              <button
                key={link.id}
                type="button"
                onClick={() => onNav(link.id)}
                data-cursor="button"
                className={cn(
                  'relative rounded-full px-3.5 py-2 font-mono text-[10px] uppercase tracking-[0.16em]',
                  'transition-colors duration-500',
                  active === link.id ? 'text-ink' : 'text-ink-faint hover:text-ink-dim',
                )}
              >
                {/* Active pill grows from the centre rather than cross-fading. */}
                <span
                  aria-hidden
                  className={cn(
                    'absolute inset-0 rounded-full border border-white/[0.08] bg-white/[0.06]',
                    'transition-[transform,opacity] duration-700 ease-[cubic-bezier(0.32,0.72,0,1)]',
                    active === link.id ? 'scale-100 opacity-100' : 'scale-90 opacity-0',
                  )}
                />
                <span className="relative">{link.label}</span>
              </button>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {/* Provenance master switch — the one control that changes every
                number on the page at once. */}
            <button
              type="button"
              onClick={toggleProvenance}
              aria-pressed={showProvenance}
              data-cursor="button"
              title="Highlight the data source behind every value on screen"
              className={cn(
                'hidden items-center gap-2 rounded-full border px-3.5 py-2 transition-colors duration-500 sm:flex',
                showProvenance
                  ? 'border-cyan-core/50 bg-cyan-core/12 text-cyan-core'
                  : 'border-hair-bright bg-white/[0.03] text-ink-faint hover:text-ink-dim',
              )}
            >
              <ScanEye className="size-3.5" strokeWidth={1.25} />
              <span className="dw-label !text-[9px] text-current">PROVENANCE</span>
            </button>

            <Button
              size="sm"
              variant="primary"
              magnetic={false}
              onClick={() => navigate('/explorer')}
              trailing={<ArrowUpRight className="size-3.5" strokeWidth={1.5} />}
              className="hidden sm:inline-flex"
            >
              Launch demo
            </Button>

            {/* Hamburger. The two rules translate to the centre and counter-
                rotate into an X — one continuous motion, no icon swap. */}
            <button
              type="button"
              className="relative grid size-10 shrink-0 place-items-center rounded-full border border-hair-bright bg-white/[0.03] text-ink-dim lg:hidden"
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            >
              <span
                aria-hidden
                className={cn(
                  'absolute h-px w-4 bg-current transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]',
                  menuOpen ? 'translate-y-0 rotate-45' : '-translate-y-[3px] rotate-0',
                )}
              />
              <span
                aria-hidden
                className={cn(
                  'absolute h-px w-4 bg-current transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]',
                  menuOpen ? 'translate-y-0 -rotate-45' : 'translate-y-[3px] rotate-0',
                )}
              />
            </button>
          </div>

        </div>
      </header>

      {/* ------------------------------------------------------- expanded menu */}
      <div
        className={cn(
          'fixed inset-0 z-[95] lg:hidden',
          'transition-opacity duration-700 ease-[cubic-bezier(0.32,0.72,0,1)]',
          menuOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        aria-hidden={!menuOpen}
      >
        <div className="absolute inset-0 bg-void/80 backdrop-blur-3xl" />

        <nav
          className="dw-mesh relative flex h-full flex-col justify-center px-6 pb-16 pt-28"
          aria-label="Sections"
        >
          {LINKS.map((link, i) => (
            /* Mask: the clip is on the wrapper, the motion on the child, so the
               label rises out of nothing rather than fading in place. */
            <span key={link.id} className="block overflow-hidden py-1">
              <button
                type="button"
                onClick={() => onNav(link.id)}
                style={{ transitionDelay: menuOpen ? `${120 + i * 55}ms` : '0ms' }}
                className={cn(
                  'block w-full text-left font-display text-[clamp(2.4rem,11vw,4rem)] font-medium leading-[1.05]',
                  'tracking-[-0.035em] text-ink transition-[transform,opacity] duration-700 ease-[cubic-bezier(0.32,0.72,0,1)]',
                  menuOpen ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0',
                )}
              >
                {link.label}
              </button>
            </span>
          ))}

          <div
            style={{ transitionDelay: menuOpen ? `${120 + LINKS.length * 55}ms` : '0ms' }}
            className={cn(
              'mt-12 flex flex-wrap items-center gap-3 transition-[transform,opacity] duration-700 ease-[cubic-bezier(0.32,0.72,0,1)]',
              menuOpen ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0',
            )}
          >
            <Button
              size="md"
              variant="primary"
              magnetic={false}
              trailing={<ArrowUpRight className="size-4" strokeWidth={1.5} />}
              onClick={() => {
                setMenuOpen(false)
                navigate('/explorer')
              }}
            >
              Launch demo
            </Button>
            <Button size="md" variant="outline" magnetic={false} onClick={toggleProvenance}>
              {showProvenance ? 'Hide sources' : 'Show sources'}
            </Button>
          </div>
        </nav>
      </div>
    </>
  )
}
