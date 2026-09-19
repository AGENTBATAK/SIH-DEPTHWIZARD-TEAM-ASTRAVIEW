import { useEffect, useRef, useState } from 'react'
import { Check, Circle, LoaderCircle, Play, Sparkles } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useSceneStore } from '../../hooks/useScene'
import { runDemo } from '../../services/pipelineService'
import { buildPlate } from '../compare/DepthComparator'
import { Button } from '../ui/Button'
import { Panel, Tag } from '../ui/Primitives'
import { cn } from '../../lib/utils'

type Step = 'scene' | 'products' | 'surface' | 'render'
type StepStatus = 'pending' | 'active' | 'complete' | 'error'

const STEPS: Array<{ id: Step; label: string; active: string; complete: string }> = [
  { id: 'scene', label: 'IMAGE / SCENE RECEIVED', active: 'Loading the built-in demo scene', complete: 'Scene loaded' },
  { id: 'products', label: 'PREPROCESSING', active: 'Preparing preview and derived products', complete: 'Image preview prepared' },
  { id: 'surface', label: 'TERRAIN GENERATION', active: 'Verifying generated elevation surface', complete: 'Elevation surface generated' },
  { id: 'render', label: '3D TERRAIN READY', active: 'Opening the existing 3D explorer', complete: 'Rendering 3D terrain' },
]

const paint = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))

/**
 * Presentation controller for the existing deterministic demo scene. It does
 * not generate a second renderer: it rebuilds the same scene through the
 * shared store, warms its derived raster products, then hands that store state
 * to the existing Explorer route.
 */
export function DemoPipeline() {
  const loadDemo = useSceneStore(s => s.loadDemo)
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState<Step | null>(null)
  const [complete, setComplete] = useState<Set<Step>>(new Set())
  const [error, setError] = useState('')
  const runningRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => () => {
    mountedRef.current = false
    abortRef.current?.abort()
  }, [])

  const statusOf = (step: Step): StepStatus => {
    if (error && active === step) return 'error'
    if (complete.has(step)) return 'complete'
    if (active === step) return 'active'
    return 'pending'
  }

  const run = async () => {
    if (runningRef.current) return
    runningRef.current = true
    const controller = new AbortController()
    abortRef.current = controller
    setOpen(true)
    setError('')
    setComplete(new Set())
    try {
      setActive('scene')
      await paint()
      // First verify the local presentation backend is reachable. Its stable
      // demo identity is the handshake, while the renderer deliberately uses
      // the canonical browser generator below: it creates the full-resolution
      // coherent RGB plate, DSM, depth raster and known structures from one
      // seed. The backend's compact transport mesh is not visually equivalent.
      const backendDemo = await runDemo(controller.signal)
      if (backendDemo.id !== 'demo_26175' || backendDemo.source !== 'demo') {
        throw new Error('The local backend returned an invalid demo configuration.')
      }
      loadDemo(26175)
      const scene = useSceneStore.getState().scene
      if (!scene) throw new Error('The canonical demo terrain could not be generated.')
      setComplete(new Set(['scene']))

      setActive('products')
      await paint()
      // These products were warmed during boot. Reusing the deterministic
      // scene and its cache prevents three duplicate 1024² raster passes.
      buildPlate(scene, 'depth')
      buildPlate(scene, 'edge')
      buildPlate(scene, 'contour')
      setComplete(new Set(['scene', 'products']))

      setActive('surface')
      await paint()
      let low = Infinity
      let high = -Infinity
      for (const height of scene.terrain.heights) {
        if (!Number.isFinite(height)) throw new Error('The demo elevation surface contained an invalid value.')
        low = Math.min(low, height)
        high = Math.max(high, height)
      }
      if (!(high > low)) throw new Error('The demo elevation surface has no usable range.')
      setComplete(new Set(['scene', 'products', 'surface']))

      setActive('render')
      await paint()
      setComplete(new Set(['scene', 'products', 'surface', 'render']))
      await paint()
      navigate('/explorer', { state: { demoPipeline: true } })
    } catch (reason) {
      if (!controller.signal.aborted && mountedRef.current) {
        setError(reason instanceof Error ? reason.message : 'The demo pipeline could not complete.')
      }
    } finally {
      runningRef.current = false
      if (abortRef.current === controller) abortRef.current = null
      if (mountedRef.current) setActive(null)
    }
  }

  return <Panel className="border-cyan-core/25 bg-cyan-core/[0.035] p-5" ticks>
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="flex items-center gap-2"><Tag tone="cyan">BUILT-IN SAMPLE</Tag><span className="dw-label text-ink-faint">PRESENTATION FLOW</span></div>
        <p className="mt-3 max-w-xl text-[12px] leading-relaxed text-ink-dim">Run the existing seeded demo scene through its real scene build and raster-product preparation, then open it in the current 3D explorer.</p>
      </div>
      <Button variant="primary" size="md" magnetic={false} icon={active ? <LoaderCircle className="size-4 animate-spin" /> : <Play className="size-4" />} trailing={<Sparkles className="size-3.5" />} disabled={Boolean(active)} onClick={() => void run()}>
        {active ? 'Running Demo' : 'Run Demo Pipeline'}
      </Button>
    </div>

    {open && <div className="mt-5 border-t border-cyan-core/15 pt-5" aria-live="polite">
      <p className="dw-label mb-4 text-cyan-core">DEMO PIPELINE</p>
      <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {STEPS.map(step => {
          const status = statusOf(step.id)
          return <li key={step.id} className={cn('border p-3', status === 'complete' ? 'border-cyan-core/35 bg-cyan-core/[0.06]' : status === 'active' ? 'border-amber-warn/45 bg-amber-warn/[0.06]' : status === 'error' ? 'border-amber-warn/60' : 'border-line bg-void/30')}>
            <div className="flex items-center gap-2"><span className={cn('grid size-5 place-items-center rounded-full border', status === 'complete' ? 'border-cyan-core text-cyan-core' : status === 'active' ? 'border-amber-warn text-amber-warn' : 'border-line-bright text-ink-faint')}>{status === 'complete' ? <Check className="size-3" /> : status === 'active' ? <LoaderCircle className="size-3 animate-spin" /> : <Circle className="size-2" />}</span><span className="dw-label text-ink-dim">{step.label}</span></div>
            <p className={cn('mt-3 text-[11px] leading-relaxed', status === 'complete' ? 'text-cyan-core' : status === 'active' ? 'text-amber-warn' : 'text-ink-faint')}>{status === 'complete' ? step.complete : status === 'active' ? step.active : 'Waiting'}</p>
          </li>
        })}
      </ol>
      {error && <p role="alert" className="mt-4 border-l border-amber-warn/60 pl-3 text-xs text-amber-warn">{error}</p>}
    </div>}
  </Panel>
}
