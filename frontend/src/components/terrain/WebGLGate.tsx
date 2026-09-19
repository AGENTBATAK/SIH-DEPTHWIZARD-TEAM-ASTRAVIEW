import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { hillshade, sampleGrid } from '../../lib/terrain'
import { sampleRamp } from '../../lib/colormaps'
import type { TerrainData } from '../../types'
import { cn } from '../../lib/utils'

/** Cached one-off probe — creating throwaway contexts is not free. */
let cachedSupport: boolean | null = null

export function detectWebGL(): boolean {
  if (cachedSupport !== null) return cachedSupport
  try {
    const canvas = document.createElement('canvas')
    const gl =
      canvas.getContext('webgl2') ??
      canvas.getContext('webgl') ??
      canvas.getContext('experimental-webgl')
    cachedSupport = Boolean(gl)
    // Release the probe context immediately rather than waiting for GC.
    const lose = (gl as WebGLRenderingContext | null)?.getExtension('WEBGL_lose_context')
    lose?.loseContext()
  } catch {
    cachedSupport = false
  }
  return cachedSupport
}

/**
 * Gate around every 3D surface.
 *
 * The fallback is not an apology box: it renders the same terrain to a 2D
 * canvas with hillshade and contours, so a machine without WebGL still sees the
 * actual elevation data rather than a broken-plugin icon.
 */
export function WebGLGate({
  children,
  terrain,
  className,
}: {
  children: ReactNode
  terrain?: TerrainData | null
  className?: string
}) {
  const [supported, setSupported] = useState<boolean | null>(null)

  useEffect(() => {
    setSupported(detectWebGL())
  }, [])

  if (supported === null) {
    return <div className={cn('size-full bg-void', className)} aria-hidden />
  }

  if (!supported) {
    return <StaticTerrainFallback terrain={terrain} className={className} />
  }

  return <>{children}</>
}

/* ------------------------------------------------------------- 2D fallback */

export function StaticTerrainFallback({
  terrain,
  className,
}: {
  terrain?: TerrainData | null
  className?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  const shaded = useMemo(() => {
    if (!terrain) return null
    return hillshade(terrain.heights, terrain.size, terrain.extentMeters, 315, 40)
  }, [terrain])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !terrain || !shaded) return
    const res = Math.min(terrain.size, 512)
    canvas.width = res
    canvas.height = res
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const img = ctx.createImageData(res, res)
    const span = terrain.maxElevation - terrain.minElevation || 1
    const interval = span / 16

    for (let y = 0; y < res; y++) {
      for (let x = 0; x < res; x++) {
        const u = x / (res - 1)
        const v = y / (res - 1)
        const elev = sampleGrid(terrain.heights, terrain.size, u, v)
        const t = (elev - terrain.minElevation) / span
        const sh = sampleGrid(shaded, terrain.size, u, v)
        let [r, g, b] = sampleRamp('hypsometric', t)
        const lit = 0.3 + 0.9 * sh
        r *= lit
        g *= lit
        b *= lit
        // Contour banding.
        const phase = elev / interval
        if (Math.abs(phase - Math.round(phase)) < 0.06) {
          r = r * 0.5 + 0.36
          g = g * 0.5 + 0.47
          b = b * 0.5 + 0.5
        }
        const o = (y * res + x) * 4
        img.data[o] = Math.min(255, r * 255)
        img.data[o + 1] = Math.min(255, g * 255)
        img.data[o + 2] = Math.min(255, b * 255)
        img.data[o + 3] = 255
      }
    }
    ctx.putImageData(img, 0, 0)
  }, [terrain, shaded])

  return (
    <div className={cn('relative size-full overflow-hidden bg-void', className)}>
      {terrain ? (
        <canvas
          ref={canvasRef}
          className="size-full object-cover opacity-80"
          style={{ imageRendering: 'auto' }}
          aria-label="Hillshaded elevation map of the current scene, rendered without WebGL."
        />
      ) : (
        <div className="dw-grid-bg size-full" />
      )}
      <div className="absolute inset-x-0 bottom-0 border-t border-line bg-void/85 p-4 backdrop-blur">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-warn" />
          <div>
            <p className="dw-label text-amber-warn">WEBGL UNAVAILABLE</p>
            <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-ink-dim">
              Interactive 3D is disabled on this device. The elevation raster above is the same
              data the 3D viewer would render, drawn as a hillshaded map with contours. Analysis
              readouts elsewhere on the page remain accurate.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
