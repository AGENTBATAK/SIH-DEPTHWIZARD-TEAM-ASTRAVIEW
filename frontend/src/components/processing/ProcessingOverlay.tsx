import { useEffect, useMemo, useRef } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import type { PipelineStage, Scene } from '../../types'
import type { ProcessingState } from '../../hooks/useUpload'
import { Button } from '../ui/Button'
import { SimplexNoise } from '../../lib/noise'
import { sampleRamp } from '../../lib/colormaps'
import { useReducedMotion } from '../../hooks/useSmoothScroll'
import { cn } from '../../lib/utils'

const STAGES: Array<{ id: PipelineStage; code: string; label: string }> = [
  { id: 'preprocessing', code: '01', label: 'PREPROCESSING' },
  { id: 'depth-inference', code: '02', label: 'SYNTHETIC TERRAIN' },
  { id: 'scale-calibration', code: '03', label: 'ILLUSTRATIVE SCALE' },
  { id: 'dsm-generation', code: '04', label: 'DSM GENERATION' },
  { id: 'terrain-mesh', code: '05', label: 'TERRAIN MESH' },
  { id: 'ready', code: '06', label: 'READY' },
]

/**
 * Processing overlay.
 *
 * The visualisation is an isometric lattice that starts as a flat image plane
 * and stands up as the pipeline advances — the same transformation the whole
 * site is about, compressed into the wait. It is drawn on a 2D canvas rather
 * than in WebGL so it cannot compete for GPU time with the work it is reporting
 * on, and it is explicitly labelled as a progress visualisation rather than a
 * preview of the result, because at this point the result does not exist yet.
 */
export function ProcessingOverlay({
  state,
  onCancel,
  scene,
}: {
  state: ProcessingState
  onCancel: () => void
  scene: Scene | null
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const progressRef = useRef(0)
  const stageRef = useRef<PipelineStage>('idle')
  const reduced = useReducedMotion()

  progressRef.current = state.progress
  stageRef.current = state.stage

  // Field seeded from the filename, so each run animates something specific
  // to the file being processed rather than a canned loop.
  const field = useMemo(() => {
    const seed = Array.from(state.filename).reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7)
    const n = new SimplexNoise(seed || 1)
    const N = 44
    const grid = new Float32Array(N * N)
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const u = x / (N - 1)
        const v = y / (N - 1)
        grid[y * N + x] = 0.5 + 0.5 * n.fbm(u * 2.2, v * 2.2, 4) + 0.35 * n.ridged(u * 3.1, v * 3.1, 4)
      }
    }
    let lo = Infinity
    let hi = -Infinity
    for (const value of grid) {
      if (value < lo) lo = value
      if (value > hi) hi = value
    }
    for (let i = 0; i < grid.length; i++) grid[i] = (grid[i] - lo) / (hi - lo || 1)
    return { grid, N }
  }, [state.filename])

  useEffect(() => {
    if (!state.active || state.stage === 'error') return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf = 0
    let t0 = performance.now()
    const { grid, N } = field

    const draw = (now: number) => {
      const time = (now - t0) / 1000
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr
        canvas.height = h * dpr
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)

      const p = progressRef.current
      const stage = stageRef.current
      const stageIndex = Math.max(0, STAGES.findIndex((s) => s.id === stage))

      // Lattice stands up as the pipeline advances.
      const rise = Math.max(0, Math.min(1, (p - 0.25) / 0.6))
      const tilt = 0.22 + rise * 0.34
      const scale = Math.min(w, h) * 0.62
      const cx = w / 2
      const cy = h / 2 + scale * 0.12
      const lift = scale * 0.42 * rise

      const project = (u: number, v: number, hv: number): [number, number] => {
        const x = (u - 0.5) * scale
        const z = (v - 0.5) * scale
        const rot = reduced ? 0 : time * 0.08
        const rx = x * Math.cos(rot) - z * Math.sin(rot)
        const rz = x * Math.sin(rot) + z * Math.cos(rot)
        return [cx + rx, cy + rz * tilt - hv * lift]
      }

      // Colour follows the stage: raw luminance, then depth ramp, then elevation.
      const rampFor = stageIndex <= 0 ? 'mono' : stageIndex <= 2 ? 'cividis' : 'hypsometric'

      // Scan position sweeps during inference.
      const scanV = stage === 'depth-inference' ? (time * 0.55) % 1 : -1

      const step = 1
      ctx.lineWidth = 1

      for (let y = 0; y < N - step; y += step) {
        for (let x = 0; x < N - step; x += step) {
          const u = x / (N - 1)
          const v = y / (N - 1)
          const hv = grid[y * N + x]

          // Cells reveal progressively so the surface materialises in sweeps.
          const reveal = Math.min(1, Math.max(0, p * 1.35 - v * 0.35))
          if (reveal <= 0.01) continue

          const [ax, ay] = project(u, v, hv)
          const [bx, by] = project((x + step) / (N - 1), v, grid[y * N + x + step])
          const [dx, dy] = project(u, (y + step) / (N - 1), grid[(y + step) * N + x])

          const [r, g, b] = sampleRamp(rampFor, hv)
          const near = scanV >= 0 ? Math.max(0, 1 - Math.abs(v - scanV) * 14) : 0
          const alpha = (0.10 + 0.30 * hv) * reveal + near * 0.7

          ctx.strokeStyle = `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${Math.min(1, alpha)})`
          ctx.beginPath()
          ctx.moveTo(ax, ay)
          ctx.lineTo(bx, by)
          ctx.moveTo(ax, ay)
          ctx.lineTo(dx, dy)
          ctx.stroke()

          // Bright nodes riding the scan line.
          if (near > 0.45) {
            ctx.fillStyle = `rgba(47,227,255,${near * 0.85})`
            ctx.fillRect(ax - 1, ay - 1, 2, 2)
          }
        }
      }

      raf = requestAnimationFrame(draw)
    }

    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [state.active, state.stage, field, reduced])

  if (!state.active) return null

  const stageIndex = STAGES.findIndex((s) => s.id === state.stage)
  const isError = state.stage === 'error'

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Processing scene"
      className="fixed inset-0 z-[180] flex items-center justify-center bg-void/94 backdrop-blur-md"
    >
      <div className="dw-grid-bg absolute inset-0 opacity-25" />
      <div className="dw-grain absolute inset-0" />

      <div className="relative grid w-full max-w-6xl gap-8 px-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:px-10">
        {/* ---------------------------------------------------- visualisation */}
        <div className="relative order-2 min-h-[300px] lg:order-1 lg:min-h-[440px]">
          {!isError ? (
            <>
              <canvas ref={canvasRef} className="size-full" aria-hidden />
              <span className="dw-label absolute bottom-2 left-2 text-ink-faint/70">
                PIPELINE VISUALISATION · NOT A PREVIEW OF THE RESULT
              </span>
            </>
          ) : (
            <div className="grid size-full place-items-center">
              <AlertTriangle className="size-16 text-amber-warn/40" />
            </div>
          )}
        </div>

        {/* ---------------------------------------------------------- status */}
        <div className="order-1 lg:order-2">
          <div className="mb-6 flex items-center justify-between">
            <span className="dw-label text-cyan-core">
              {isError ? 'PIPELINE HALTED' : 'PROCESSING'}
            </span>
            <button
              type="button"
              onClick={onCancel}
              aria-label="Cancel processing"
              className="grid size-7 place-items-center border border-line-bright text-ink-faint transition-colors hover:border-amber-warn/60 hover:text-amber-warn"
            >
              <X className="size-3.5" />
            </button>
          </div>

          <p className="dw-value mb-1 truncate text-sm text-ink" title={state.filename}>
            {state.filename}
          </p>
          <p className="mb-8 text-[12px] leading-relaxed text-ink-faint">{state.detail}</p>

          {isError ? (
            <div className="border-l border-amber-warn/50 pl-4">
              <p className="dw-label mb-2 text-amber-warn">ERROR</p>
              <p className="text-[13px] leading-relaxed text-ink-dim">{state.error}</p>
              <Button variant="outline" size="sm" magnetic={false} className="mt-5" onClick={onCancel}>
                Close
              </Button>
            </div>
          ) : (
            <>
              {/* Stage timeline */}
              <ol className="space-y-3">
                {STAGES.map((s, i) => {
                  const done = i < stageIndex
                  const current = i === stageIndex
                  return (
                    <li key={s.id} className="flex items-center gap-3">
                      <span
                        className={cn(
                          'grid size-5 shrink-0 place-items-center border font-mono text-[8px] transition-colors',
                          done
                            ? 'border-cyan-core/50 bg-cyan-core/10 text-cyan-core'
                            : current
                              ? 'border-cyan-core bg-cyan-core/20 text-cyan-core'
                              : 'border-line-bright text-ink-faint/60',
                        )}
                      >
                        {s.code}
                      </span>
                      <span
                        className={cn(
                          'dw-label transition-colors',
                          done ? 'text-ink-dim' : current ? 'text-ink' : 'text-ink-faint/50',
                        )}
                      >
                        {s.label}
                      </span>
                      {current && (
                        <span className="ml-auto size-1.5 animate-pulse rounded-full bg-cyan-core" />
                      )}
                      {done && <span className="dw-label ml-auto text-cyan-core">OK</span>}
                    </li>
                  )
                })}
              </ol>

              {/* Progress */}
              <div className="mt-8">
                <div className="mb-2 flex justify-between">
                  <span className="dw-label">TOTAL</span>
                  <span className="dw-value text-xs text-cyan-core tabular">
                    {Math.round(state.progress * 100)}%
                  </span>
                </div>
                <div className="h-px bg-white/10">
                  <div
                    className="h-px origin-left bg-cyan-core shadow-[0_0_10px_rgba(47,227,255,0.7)] transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
                    style={{ transform: `scaleX(${state.progress})` }}
                  />
                </div>
              </div>

              <Button
                variant="ghost"
                size="sm"
                magnetic={false}
                className="mt-6"
                onClick={onCancel}
              >
                Cancel
              </Button>

              {scene && (
                <p className="mt-8 border-t border-line pt-4 text-[11px] leading-relaxed text-ink-faint">
                  The current scene stays loaded until this one finishes. Cancelling leaves it
                  untouched.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
