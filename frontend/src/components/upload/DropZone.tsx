import { useCallback, useRef, useState } from 'react'
import { FileImage, Layers, Upload } from 'lucide-react'
import { ACCEPTED_EXTENSIONS } from '../../services/uploadService'
import { Tag } from '../ui/Primitives'
import { cn } from '../../lib/utils'

/**
 * Drop target.
 *
 * Accepts a click, a keyboard activation and a drop, and states its own limits
 * up front — accepted formats, the fact that processing is local, and what
 * happens to a file with no georeferencing. Users should not have to upload
 * something to discover the tool cannot anchor it.
 */
export function DropZone({
  onFile,
  globalDragging,
  disabled,
}: {
  onFile: (file: File) => void
  globalDragging: boolean
  disabled?: boolean
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [over, setOver] = useState(false)

  const pick = useCallback(() => inputRef.current?.click(), [])

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Upload a scene. Accepts PNG, JPG and GeoTIFF."
      aria-disabled={disabled}
      data-cursor="upload"
      onClick={disabled ? undefined : pick}
      onKeyDown={(e) => {
        if (disabled) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          pick()
        }
      }}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        e.stopPropagation()
        setOver(false)
        const file = e.dataTransfer.files?.[0]
        if (file && !disabled) onFile(file)
      }}
      className={cn(
        'group relative flex min-h-[340px] w-full flex-col items-center justify-center overflow-hidden',
        'rounded-[2rem] border border-dashed transition-[background-color,border-color] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]',
        'focus-visible:outline-none',
        disabled && 'pointer-events-none opacity-40',
        over || globalDragging
          ? 'border-cyan-core bg-cyan-core/[0.06]'
          : 'border-line-bright bg-graphite/40 hover:border-cyan-core/50 hover:bg-graphite/70',
      )}
    >
      <div className="dw-grid-fine absolute inset-0 opacity-[0.18]" />

      {/* Corner reticles */}
      {(['left-3 top-3 border-l border-t', 'right-3 top-3 border-r border-t', 'left-3 bottom-3 border-l border-b', 'right-3 bottom-3 border-r border-b'] as const).map(
        (pos) => (
          <span
            key={pos}
            aria-hidden
            className={cn(
              'absolute size-4 transition-colors duration-300',
              pos,
              over || globalDragging ? 'border-cyan-core' : 'border-line-bright',
            )}
          />
        ),
      )}

      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        accept={ACCEPTED_EXTENSIONS.join(',')}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onFile(file)
          // Allow re-selecting the same file after a cancel.
          e.target.value = ''
        }}
      />

      <div className="relative flex flex-col items-center px-6 text-center">
        <span
          className={cn(
            'mb-7 grid size-16 place-items-center rounded-full border shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] transition-[background-color,border-color,transform,color] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]',
            over || globalDragging
              ? 'scale-110 border-cyan-core bg-cyan-core/10 text-cyan-core'
              : 'border-line-bright text-ink-faint group-hover:border-cyan-core/50 group-hover:text-cyan-core',
          )}
        >
          <Upload className="size-5" />
        </span>

        <p className="font-display text-xl font-medium tracking-[-0.02em] text-ink">
          {over || globalDragging ? 'DROP IMAGE TO INITIALIZE TERRAIN' : 'UPLOAD YOUR SCENE'}
        </p>
        <p className="mt-3 max-w-sm text-[13px] leading-relaxed text-ink-dim">
          Drag a file anywhere on this page, or click to browse. A display preview is uploaded to the local backend and saved for your presentation.
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <Tag>
            <FileImage className="size-2.5" />
            PNG
          </Tag>
          <Tag>
            <FileImage className="size-2.5" />
            JPG
          </Tag>
          <Tag tone="cyan">
            <Layers className="size-2.5" />
            GEOTIFF
          </Tag>
        </div>

        <p className="mt-6 max-w-md text-[11px] leading-relaxed text-ink-faint">
          PNG, JPG or TIFF, up to 64 MB. The original file stays in your browser; only a resized preview is saved. All uploaded scenes use synthetic terrain, including GeoTIFFs.
        </p>
      </div>
    </div>
  )
}
