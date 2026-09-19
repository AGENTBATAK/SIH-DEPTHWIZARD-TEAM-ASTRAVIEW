import { useNavigate } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import { ArrowUpRight, Maximize2 } from 'lucide-react'
import { Button } from '../ui/Button'
import { Section, SectionHeading, Tag, useVisibility } from '../ui/Primitives'
import { useSceneStore } from '../../hooks/useScene'

const TerrainViewer = lazy(() => import('../terrain/TerrainViewer').then((m) => ({ default: m.TerrainViewer })))

/**
 * Embedded explorer.
 *
 * Mounted only once it has been near the viewport. A second WebGL context plus a
 * 65k-vertex mesh is not something to create while the user is still reading the
 * hero — and on machines with a low context limit, eagerly mounting every canvas
 * on the page is how the hero ends up losing its own context.
 */
export function ExplorerSection() {
  const [ref, visible] = useVisibility<HTMLDivElement>('400px')
  const navigate = useNavigate()
  const scene = useSceneStore((s) => s.scene)

  return (
    <Section id="explorer" className="bg-void py-28 sm:py-36 lg:py-44">
      <div className="mx-auto max-w-[1680px] px-4 sm:px-10 lg:px-16">
        <div className="flex flex-wrap items-end justify-between gap-8">
          <SectionHeading
            index="07"
            eyebrow="3D TERRAIN EXPLORER"
            title={
              <>
                NAVIGATE
                <br />
                THE SURFACE
              </>
            }
            lede="Orbit, zoom and sample the DSM directly. Every reading under the cursor is taken from the elevation raster, not from the rendered pixels."
          />

          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="primary"
              magnetic={false}
              icon={<Maximize2 className="size-4" />}
              trailing={<ArrowUpRight className="size-4" />}
              onClick={() => navigate('/explorer')}
            >
              Launch full explorer
            </Button>
          </div>
        </div>

        <div className="mt-10 flex flex-wrap items-center gap-2">
          <Tag tone="cyan">ORBIT · ZOOM · PAN</Tag>
          <Tag>MEASURE</Tag>
          <Tag>STRUCTURE INSPECT</Tag>
          <Tag>FIRST-PERSON FLYTHROUGH</Tag>
          {scene?.source === 'demo' && <Tag tone="amber">DEMO SCENE</Tag>}
        </div>

        {/* The viewer is the plate; this is its tray. Same double-bezel as the
            content cards, so the largest element on the page belongs to the
            same family as the smallest. */}
        <div ref={ref} className="dw-shell mt-8">
          {visible ? (
            <Suspense fallback={<div className="dw-grid-bg dw-core h-[76svh] min-h-[520px] w-full opacity-30" />}>
              <TerrainViewer variant="embedded" />
            </Suspense>
          ) : (
            <div className="dw-grid-bg dw-core h-[76svh] min-h-[520px] w-full opacity-30" />
          )}
        </div>

        <p className="mt-4 max-w-3xl text-[12px] leading-relaxed text-ink-faint">
          The full explorer adds pointer-lock flythrough, the complete layer stack and the map view
          in a dedicated viewport. It shares this scene — anything you upload here carries across.
        </p>
      </div>
    </Section>
  )
}
