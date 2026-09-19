import { useCallback } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'
import { DropZone } from './DropZone'
import { FileMetadata } from './FileMetadata'
import { ProcessingOverlay } from '../processing/ProcessingOverlay'
import { Button } from '../ui/Button'
import { Panel, Section, SectionHeading, Tag } from '../ui/Primitives'
import { useSceneStore } from '../../hooks/useScene'
import { useGlobalDrag, useUpload } from '../../hooks/useUpload'
import { SavedScenes } from './SavedScenes'
import { SyntheticWorkflow } from './SyntheticWorkflow'
import { DemoPipeline } from './DemoPipeline'

/** Image input, prototype disclosure and saved scene library. */
export function UploadSection() {
  const scene = useSceneStore((s) => s.scene)
  const loadDemo = useSceneStore((s) => s.loadDemo)
  const { state, start, cancel, dismissError } = useUpload()
  const dragging = useGlobalDrag(start)

  const onFile = useCallback((file: File) => start(file), [start])


  return (
    <Section id="upload" className="relative bg-void py-28 sm:py-36 lg:py-44">
      <div className="mx-auto max-w-[1680px] px-4 sm:px-10 lg:px-16">
        <SectionHeading
          index="05"
          eyebrow="INPUT"
          title={
            <>
              UPLOAD
              <br />
              YOUR SCENE
            </>
          }
          lede="Upload an image, explore synthetic terrain, and reopen saved scenes. A working presentation prototype with local storage and no AI or GIS pipeline."
        />

        <Panel className="mt-12 flex flex-col gap-3 p-5">
          <div className="flex items-center gap-3"><span className="dw-label text-ink-dim">LOCAL BACKEND</span><Tag tone="amber">PRESENTATION PROTOTYPE</Tag></div>
          <p className="max-w-3xl text-[12px] leading-relaxed text-ink-dim">The server saves an image preview and generates repeatable synthetic terrain. Terrain shape does not represent your image. Elevation, scale and map placement are illustrative; no model inference or reference elevation lookup runs.</p>
        </Panel>

        {/* ------------------------------------------------------------ grid */}
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-4">
            <DropZone onFile={onFile} globalDragging={dragging} disabled={state.active} />
            <DemoPipeline />

            {state.error && (
              <div className="flex items-start gap-3 border border-amber-warn/40 bg-amber-warn/[0.06] p-4">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-warn" />
                <div className="flex-1">
                  <p className="dw-label text-amber-warn">UPLOAD REJECTED</p>
                  <p className="mt-2 text-[12px] leading-relaxed text-ink-dim">{state.error}</p>
                </div>
                <button
                  type="button"
                  onClick={dismissError}
                  className="dw-label transition-colors hover:text-ink"
                >
                  DISMISS
                </button>
              </div>
            )}

            {scene?.source === 'upload' && (
              <div className="flex items-center justify-between gap-3 border border-line bg-graphite/50 p-3">
                <p className="text-[12px] text-ink-dim">
                  Viewing a saved prototype scene. The explorer shows synthetic terrain alongside your image.
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  magnetic={false}
                  icon={<RotateCcw className="size-3.5" />}
                  onClick={() => loadDemo()}
                >
                  Restore demo
                </Button>
              </div>
            )}
          </div>

          {scene && <FileMetadata scene={scene} />}
        </div>
        <SavedScenes disabled={state.active} />
        <SyntheticWorkflow />
      </div>

      {/* --------------------------------------------------- drag affordance */}
      {dragging && !state.active && (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-[150] flex items-center justify-center bg-void/70 backdrop-blur-sm"
        >
          <div className="dw-grid-bg absolute inset-0 opacity-30" />
          <div className="relative border border-cyan-core/60 bg-void/80 px-10 py-8 text-center">
            <p className="dw-label mb-3 text-cyan-core">INPUT DETECTED</p>
            <p className="font-display text-2xl font-medium tracking-[-0.02em] text-ink">
              DROP IMAGE TO INITIALIZE TERRAIN
            </p>
            <p className="mt-3 text-[12px] text-ink-dim">PNG / JPG / TIFF / saved on the local server</p>
          </div>
        </div>
      )}

      <ProcessingOverlay state={state} onCancel={cancel} scene={scene} />
    </Section>
  )
}
