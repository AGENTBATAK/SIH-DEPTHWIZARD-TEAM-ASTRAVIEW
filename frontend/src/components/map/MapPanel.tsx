import { useEffect, useMemo, useRef, useState } from 'react'
import { Map as MapLibreMap, NavigationControl, type ErrorEvent } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Box, Layers2, Mountain } from 'lucide-react'
import type { Scene } from '../../types'
import { renderScalar } from '../../lib/raster'
import { contourIntervalFor } from '../terrain/terrainMaterial'
import { StaticTerrainFallback } from '../terrain/WebGLGate'
import { Panel, Tag } from '../ui/Primitives'
import { fmtLat, fmtLon } from '../../lib/format'
import { cn } from '../../lib/utils'

/**
 * Geographic context view.
 *
 * Basemap resolution order, and why: an explicit style URL if one is
 * configured, then MapTiler if a key is present, then OpenFreeMap — which needs
 * no key at all, so the map works out of the box for anyone who clones this
 * repository. If none of those load, the panel falls back to rendering the
 * scene's own hillshade rather than showing a broken tile grid, because a grey
 * checkerboard in the middle of a demo is worse than no basemap.
 *
 * The DSM is draped over whichever basemap loads, georeferenced to the scene
 * footprint — that overlay is the actual product, and it is ours regardless of
 * whose tiles are underneath.
 */

const STYLE_URL: string = (() => {
  const explicit = import.meta.env.VITE_MAP_STYLE_URL
  if (explicit) return explicit
  const key = import.meta.env.VITE_MAPTILER_KEY
  if (key) return `https://api.maptiler.com/maps/dataviz-dark/style.json?key=${key}`
  return 'https://tiles.openfreemap.org/styles/dark'
})()

export function MapPanel({ scene }: { scene: Scene }) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const [failed, setFailed] = useState(!import.meta.env.VITE_MAP_STYLE_URL && !import.meta.env.VITE_MAPTILER_KEY)
  const [ready, setReady] = useState(false)
  const [pitched, setPitched] = useState(true)
  const [overlayOn, setOverlayOn] = useState(true)

  const bounds = scene.terrain.bounds
  const center = useMemo<[number, number]>(
    () => [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2],
    [bounds],
  )

  const overlayUrl = useMemo(() => {
    const interval = contourIntervalFor(scene.terrain.maxElevation - scene.terrain.minElevation)
    return renderScalar(scene.dsm.heights, scene.dsm.size, {
      ramp: 'hypsometric',
      contourInterval: interval,
      contourOpacity: 0.5,
    }).toDataURL()
  }, [scene])

  /* ------------------------------------------------------------- lifecycle */

  useEffect(() => {
    const el = containerRef.current
    if (!el || mapRef.current || (!import.meta.env.VITE_MAP_STYLE_URL && !import.meta.env.VITE_MAPTILER_KEY)) return

    let map: MapLibreMap
    try {
      map = new MapLibreMap({
        container: el,
        style: STYLE_URL,
        center,
        zoom: 11.4,
        pitch: 52,
        bearing: -18,
        attributionControl: { compact: true },
      })
    } catch {
      setFailed(true)
      return
    }

    mapRef.current = map
    map.addControl(new NavigationControl({ visualizePitch: true }), 'bottom-right')

    // If the style never arrives, stop waiting and render our own data instead.
    const timeout = setTimeout(() => {
      if (!map.isStyleLoaded()) setFailed(true)
    }, 9000)

    map.on('error', (e: ErrorEvent) => {
      // Tile-level errors are survivable; a missing style is not.
      const message = String(e.error?.message ?? '')
      if (message.includes('style') || !map.isStyleLoaded()) setFailed(true)
    })

    map.on('load', () => {
      clearTimeout(timeout)
      setReady(true)

      map.addSource('dw-dsm', {
        type: 'image',
        url: overlayUrl,
        coordinates: [
          [bounds[0], bounds[3]],
          [bounds[2], bounds[3]],
          [bounds[2], bounds[1]],
          [bounds[0], bounds[1]],
        ],
      })
      map.addLayer({
        id: 'dw-dsm-layer',
        type: 'raster',
        source: 'dw-dsm',
        paint: { 'raster-opacity': 0.82, 'raster-fade-duration': 300 },
      })

      map.addSource('dw-footprint', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [bounds[0], bounds[1]],
                [bounds[2], bounds[1]],
                [bounds[2], bounds[3]],
                [bounds[0], bounds[3]],
                [bounds[0], bounds[1]],
              ],
            ],
          },
        },
      })
      map.addLayer({
        id: 'dw-footprint-line',
        type: 'line',
        source: 'dw-footprint',
        paint: { 'line-color': '#2fe3ff', 'line-width': 1.4, 'line-opacity': 0.9 },
      })

      map.fitBounds(
        [
          [bounds[0], bounds[1]],
          [bounds[2], bounds[3]],
        ],
        { padding: 72, duration: 0 },
      )
    })

    return () => {
      clearTimeout(timeout)
      map.remove()
      mapRef.current = null
    }
  }, [bounds, center, overlayUrl])

  /* --------------------------------------------------------------- toggles */

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    map.easeTo({ pitch: pitched ? 52 : 0, bearing: pitched ? -18 : 0, duration: 700 })
  }, [pitched, ready])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !map.getLayer('dw-dsm-layer')) return
    map.setPaintProperty('dw-dsm-layer', 'raster-opacity', overlayOn ? 0.82 : 0)
  }, [overlayOn, ready])

  /* -------------------------------------------------------------- fallback */

  if (failed) {
    return (
      <div className="relative size-full">
        <StaticTerrainFallback terrain={scene.terrain} />
        <div className="dw-panel-glass absolute left-4 top-4 max-w-xs px-3 py-2">
          <p className="dw-label mb-1.5 text-amber-warn">LOCAL TERRAIN MAP</p>
          <p className="text-[11px] leading-relaxed text-ink-dim">
            Showing the scene's hillshaded terrain. Map placement and heights are illustrative in this presentation prototype. An external basemap is optional.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative size-full">
      <div ref={containerRef} className="size-full" data-lenis-prevent />

      {/* Controls */}
      <div className="absolute right-4 top-16 flex flex-col gap-2">
        <button
          type="button"
          onClick={() => setPitched((v) => !v)}
          data-cursor="button"
          className={cn(
            'dw-panel-glass flex items-center gap-2 px-2.5 py-2 transition-colors',
            pitched ? 'text-cyan-core' : 'text-ink-faint hover:text-ink-dim',
          )}
        >
          {pitched ? <Mountain className="size-3.5" /> : <Box className="size-3.5" />}
          <span className="dw-label text-current">{pitched ? '3D TILT' : 'FLAT'}</span>
        </button>
        <button
          type="button"
          onClick={() => setOverlayOn((v) => !v)}
          data-cursor="button"
          className={cn(
            'dw-panel-glass flex items-center gap-2 px-2.5 py-2 transition-colors',
            overlayOn ? 'text-cyan-core' : 'text-ink-faint hover:text-ink-dim',
          )}
        >
          <Layers2 className="size-3.5" />
          <span className="dw-label text-current">DSM OVERLAY</span>
        </button>
      </div>

      {/* Footprint readout */}
      <Panel glass className="absolute bottom-4 left-4 max-w-[260px] p-3">
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <span className="dw-label">IMAGE FOOTPRINT</span>
          {scene.source === 'demo' ? <Tag tone="amber">DEMO</Tag> : <Tag tone="cyan">UPLOAD</Tag>}
        </div>
        <dl className="space-y-1.5">
          <div className="flex justify-between gap-2">
            <dt className="dw-label">NW</dt>
            <dd className="dw-value text-[10px] text-ink-dim">
              {fmtLat(bounds[3], 3)} · {fmtLon(bounds[0], 3)}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="dw-label">SE</dt>
            <dd className="dw-value text-[10px] text-ink-dim">
              {fmtLat(bounds[1], 3)} · {fmtLon(bounds[2], 3)}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="dw-label">EXTENT</dt>
            <dd className="dw-value text-[10px] text-ink">
              {(scene.terrain.extentMeters / 1000).toFixed(2)} km
            </dd>
          </div>
        </dl>
        {scene.source === 'demo' && (
          <p className="mt-3 text-[10px] leading-relaxed text-ink-faint">
            The demo footprint is placed near Bhopal for geographic context. The terrain itself is
            generated, not observed.
          </p>
        )}
      </Panel>
    </div>
  )
}
