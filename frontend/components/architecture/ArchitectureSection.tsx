import { useState } from 'react'
import {
  Boxes,
  Cpu,
  FileStack,
  Layers3,
  Mountain,
  Ruler,
  Satellite,
  Waves,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Panel, PanelHeader, Section, SectionHeading, Tag } from '../ui/Primitives'
import { cn } from '../../lib/utils'

/**
 * System architecture.
 *
 * Drawn as a spine rather than a free-floating graph so it stays readable at
 * every width without a layout engine. It describes the presentation path that
 * is actually available in this build.
 */

interface Node {
  id: string
  label: string
  sub: string
  icon: LucideIcon
  detail: string
  io: { in: string; out: string }
  tags: string[]
  /** Highlights the point where presentation values are created. */
  pivotal?: boolean
}

const NODES: Node[] = [
  {
    id: 'input',
    label: 'RGB / GEOTIFF',
    sub: 'INPUT',
    icon: FileStack,
    detail:
      'A single optical frame. PNG, JPG and GeoTIFF are accepted. The prototype preserves a display preview; it does not use geodata to reconstruct terrain.',
    io: { in: 'File', out: 'Display preview' },
    tags: ['PNG', 'JPG', 'GEOTIFF'],
  },
  {
    id: 'preprocess',
    label: 'PREPROCESSING',
    sub: 'DISPLAY PREVIEW',
    icon: Layers3,
    detail:
      'The browser decodes the image and makes a bounded PNG preview. The preview, filename, dimensions and byte count are sent to the local server; the original file stays in the browser.',
    io: { in: 'File', out: 'PNG preview + metadata' },
    tags: ['BROWSER', 'RESAMPLE', 'LOCAL'],
  },
  {
    id: 'depth',
    label: 'SYNTHETIC TERRAIN',
    sub: 'REPEATABLE PRESENTATION SURFACE',
    icon: Cpu,
    detail:
      'The local server hashes the preview and generates a repeatable procedural height field. It is deliberately labelled synthetic: it is not AI inference or a reconstruction of the uploaded image.',
    io: { in: 'Preview hash', out: 'Synthetic height field' },
    tags: ['NODE.JS', 'LOCAL', 'NO AI'],
  },
  {
    id: 'relative',
    label: 'PRESENTATION RASTER',
    sub: 'SIMULATED VALUES',
    icon: Waves,
    detail:
      'The server returns a normalized display field and its corresponding synthetic height raster. Both share the same data shape expected by the existing 3D viewer.',
    io: { in: 'Synthetic field', out: 'Depth-like field + height raster' },
    tags: ['256²', 'SIMULATED', 'TYPED ARRAYS'],
  },
  {
    id: 'calibration',
    label: 'ILLUSTRATIVE SCALE',
    sub: 'NO REFERENCE ELEVATION',
    icon: Ruler,
    detail:
      'The prototype assigns an illustrative range so the existing viewer can demonstrate contours, layers and measurements. It does not fetch a DEM or calculate accuracy metrics.',
    io: { in: 'Synthetic height field', out: 'Illustrative scale + unavailable metrics' },
    tags: ['NO GIS', 'NO DEM', 'SIMULATED'],
    pivotal: true,
  },
  {
    id: 'dsm',
    label: 'TERRAIN RASTER',
    sub: 'PRESENTATION DATA',
    icon: Mountain,
    detail:
      'One synthetic height per cell. It keeps the existing terrain features functional while provenance labels prevent it being presented as a surveyed product.',
    io: { in: 'Illustrative scale', out: 'Terrain raster + unavailable metrics' },
    tags: ['SIMULATED', 'PROVENANCE', '256²'],
  },
  {
    id: 'mesh',
    label: '3D MESH',
    sub: 'TRIANGULATION',
    icon: Boxes,
    detail:
      'The raster is uploaded as a float height texture and displaced in the vertex shader, so vertical exaggeration and the assembly animation cost nothing per frame. Normals are recomputed from neighbouring texels to keep lighting correct at any exaggeration.',
    io: { in: 'Elevation raster', out: 'Displaced surface' },
    tags: ['THREE.JS', 'GPU DISPLACEMENT'],
  },
  {
    id: 'viewer',
    label: 'WEBGL VIEWER',
    sub: 'INTERACTION',
    icon: Satellite,
    detail:
      'Orbit and first-person navigation, CPU ray-marched picking against the height field, measurement, structure inspection, and a MapLibre view with the DSM draped over its geographic footprint.',
    io: { in: 'Surface + scene state', out: 'Interaction, measurements' },
    tags: ['R3F', 'MAPLIBRE', 'RAYMARCH'],
  },
]

export function ArchitectureSection() {
  const [selected, setSelected] = useState<Node>(NODES[4])

  return (
    <Section id="architecture" className="relative bg-void py-28 sm:py-36 lg:py-44">
      <div className="dw-grid-bg absolute inset-0 opacity-[0.14]" />

      <div className="relative mx-auto max-w-[1680px] px-4 sm:px-10 lg:px-16">
        <SectionHeading
          index="11"
          eyebrow="SYSTEM ARCHITECTURE"
          title={
            <>
              HOW IT IS
              <br />
              PUT TOGETHER
            </>
          }
          lede="Select a stage to see what it consumes and emits. This diagram describes the local presentation backend, with synthetic data clearly identified at every stage."
        />

        <div className="mt-14 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-12">
          {/* ------------------------------------------------------- spine */}
          <ol className="relative">
            {NODES.map((node, i) => {
              const active = selected.id === node.id
              return (
                <li key={node.id} className="relative">
                  <button
                    type="button"
                    onClick={() => setSelected(node)}
                    onMouseEnter={() => setSelected(node)}
                    data-cursor="button"
                    aria-pressed={active}
                    className={cn(
                      'group relative flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition-[background-color,border-color,transform] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]',
                      active
                        ? 'border-cyan-core/60 bg-cyan-core/[0.07]'
                        : node.pivotal
                          ? 'border-teal-sub/35 bg-graphite/40 hover:border-cyan-core/40'
                          : 'border-line bg-graphite/30 hover:border-line-bright',
                    )}
                  >
                    <span
                      className={cn(
                        'grid size-9 shrink-0 place-items-center border transition-colors',
                        active
                          ? 'border-cyan-core/60 bg-cyan-core/10 text-cyan-core'
                          : 'border-line-bright text-ink-faint group-hover:text-ink-dim',
                      )}
                    >
                      <node.icon className="size-4" />
                    </span>

                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          'dw-value block text-[13px] tracking-tight transition-colors',
                          active ? 'text-ink' : 'text-ink-dim',
                        )}
                      >
                        {node.label}
                      </span>
                      <span className="dw-label mt-1 block truncate">{node.sub}</span>
                    </span>

                    <span className="dw-label shrink-0 text-ink-faint/70">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                  </button>

                  {/* Connector */}
                  {i < NODES.length - 1 && (
                    <div className="relative ml-[30px] h-6 w-px bg-line-bright">
                      <span
                        aria-hidden
                        className={cn(
                          'absolute left-1/2 h-2 w-px -translate-x-1/2 bg-cyan-core transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]',
                          active ? 'top-0 opacity-100' : 'top-2 opacity-0',
                        )}
                      />
                    </div>
                  )}

                  {/* Presentation-mode branch into illustrative scale */}
                  {node.id === 'relative' && (
                    <div className="pointer-events-none absolute -right-2 top-full z-10 hidden translate-y-2 items-center gap-2 sm:flex">
                      <span className="h-px w-8 bg-teal-sub/50" />
                      <span className="border border-teal-sub/40 bg-void/80 px-2 py-1.5">
                        <span className="dw-label text-teal-sub">PRESENTATION MODE</span>
                        <span className="dw-value mt-1 block text-[9px] text-ink-faint">
                          NO DEM · NO GIS · NO AI
                        </span>
                      </span>
                    </div>
                  )}
                </li>
              )
            })}
          </ol>

          {/* ------------------------------------------------------ detail */}
          <div className="lg:sticky lg:top-24 lg:self-start">
            <Panel className="p-0" ticks>
              <PanelHeader
                title="NODE DETAIL"
                right={selected.pivotal ? <Tag tone="amber">ILLUSTRATIVE VALUES</Tag> : <Tag>STAGE</Tag>}
              />
              <div className="p-5">
                <div className="mb-5 flex items-start gap-4">
                  <span className="grid size-11 shrink-0 place-items-center border border-cyan-core/40 bg-cyan-core/10 text-cyan-core">
                    <selected.icon className="size-5" />
                  </span>
                  <div>
                    <h3 className="font-display text-xl font-medium tracking-[-0.02em] text-ink">
                      {selected.label}
                    </h3>
                    <p className="dw-label mt-1.5">{selected.sub}</p>
                  </div>
                </div>

                <p className="text-[13px] leading-relaxed text-ink-dim">{selected.detail}</p>

                <div className="dw-rule my-5" />

                <dl className="space-y-3">
                  <div>
                    <dt className="dw-label mb-1.5">CONSUMES</dt>
                    <dd className="dw-value text-[12px] text-ink">{selected.io.in}</dd>
                  </div>
                  <div>
                    <dt className="dw-label mb-1.5">EMITS</dt>
                    <dd className="dw-value text-[12px] text-cyan-core">{selected.io.out}</dd>
                  </div>
                </dl>

                <div className="mt-5 flex flex-wrap gap-2">
                  {selected.tags.map((t) => (
                    <Tag key={t}>{t}</Tag>
                  ))}
                </div>
              </div>
            </Panel>

            <p className="mt-4 text-[11.5px] leading-relaxed text-ink-faint">
              The browser calls <span className="dw-value text-ink-dim">services/pipelineService.ts</span>, which
              sends preview data to the local Node backend and hydrates the returned raster for the
              existing 3D viewer.
            </p>
          </div>
        </div>
      </div>
    </Section>
  )
}
