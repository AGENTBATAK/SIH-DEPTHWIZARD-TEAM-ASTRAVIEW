import { lazy, Suspense, useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ArrowLeft, Check, ScanEye } from 'lucide-react'
import { useSceneStore } from '../hooks/useScene'
import { ProvenanceLegend } from '../components/ui/Metric'
import { cn } from '../lib/utils'

const TerrainViewer = lazy(() => import('../components/terrain/TerrainViewer').then((m) => ({ default: m.TerrainViewer })))

/**
 * Full-screen explorer.
 *
 * Deliberately not wrapped in the smooth-scroll context: pointer lock, WASD and
 * orbit damping all fight a scroll library, and there is nothing to scroll here
 * anyway. It reads the same store as the landing page, so an uploaded scene
 * carries straight across.
 */
export function Explorer() {
  const scene = useSceneStore((s) => s.scene)
  const loadDemo = useSceneStore((s) => s.loadDemo)
  const showProvenance = useSceneStore((s) => s.showProvenance)
  const toggleProvenance = useSceneStore((s) => s.toggleProvenance)
  const location = useLocation()
  const [demoComplete, setDemoComplete] = useState(Boolean((location.state as { demoPipeline?: boolean } | null)?.demoPipeline))

  // Deep link straight to /explorer with no scene in the store.
  useEffect(() => {
    if (!scene) loadDemo()
  }, [scene, loadDemo])

  useEffect(() => {
    if (!demoComplete) return
    const id = window.setTimeout(() => setDemoComplete(false), 5000)
    return () => window.clearTimeout(id)
  }, [demoComplete])

  return (
    <div className="relative h-[100svh] w-full overflow-hidden bg-void">
      <Suspense fallback={<div className="dw-grid-bg size-full" />}>
        <TerrainViewer variant="full" />
      </Suspense>

      {demoComplete && (
        <div className="pointer-events-none absolute left-1/2 top-20 z-40 w-[min(92vw,520px)] -translate-x-1/2 border border-cyan-core/40 bg-void/90 px-4 py-3 shadow-[0_16px_48px_-28px_rgba(47,227,255,0.7)] backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <Check className="size-4 shrink-0 text-cyan-core" />
            <div>
              <p className="dw-label text-cyan-core">DEMO COMPLETE — TERRAIN READY</p>
              <p className="mt-1 text-[11px] text-ink-dim">Explore the generated terrain in 3D. Measure, inspect, or enter flythrough.</p>
            </div>
          </div>
        </div>
      )}

      {/* Return + provenance, kept clear of the viewer's own top-left panel. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-center p-4">
        <div className="pointer-events-auto flex items-center gap-2">
          <Link
            to="/"
            className="dw-panel-glass flex items-center gap-2 px-3 py-2 text-ink-dim transition-colors hover:text-cyan-core"
          >
            <ArrowLeft className="size-3.5" />
            <span className="dw-label text-current">BACK TO OVERVIEW</span>
          </Link>

          <button
            type="button"
            onClick={toggleProvenance}
            aria-pressed={showProvenance}
            title="Highlight the data source behind every value on screen"
            className={cn(
              'dw-panel-glass flex items-center gap-2 px-3 py-2 transition-colors',
              showProvenance ? 'text-cyan-core' : 'text-ink-faint hover:text-ink-dim',
            )}
          >
            <ScanEye className="size-3.5" />
            <span className="dw-label text-current">PROVENANCE</span>
          </button>
        </div>
      </div>

      {showProvenance && (
        <div // Clears the tool row pinned to the bottom-left.
          className="dw-panel-glass pointer-events-none absolute bottom-24 left-1/2 z-30 max-w-[min(92vw,880px)] -translate-x-1/2 px-4 py-3">
          <ProvenanceLegend />
        </div>
      )}
    </div>
  )
}
