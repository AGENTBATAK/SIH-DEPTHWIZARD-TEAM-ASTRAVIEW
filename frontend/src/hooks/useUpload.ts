import { useCallback, useEffect, useRef, useState } from 'react'
import { useSceneStore } from './useScene'
import { processUpload, validateUpload } from '../services/uploadService'
import type { PipelineStage } from '../types'

/**
 * Upload orchestration.
 *
 * Owns the abort controller, the stage machine and the error surface so the
 * drop zone and the processing overlay stay presentational. Cancellation is a
 * first-class path rather than an afterthought: a 4000×4000 GeoTIFF genuinely
 * takes long enough that a user will want out.
 */

export interface ProcessingState {
  active: boolean
  stage: PipelineStage
  progress: number
  detail: string
  filename: string
  error: string | null
}

const INITIAL: ProcessingState = {
  active: false,
  stage: 'idle',
  progress: 0,
  detail: '',
  filename: '',
  error: null,
}

export function useUpload() {
  const [state, setState] = useState<ProcessingState>(INITIAL)
  const abortRef = useRef<AbortController | null>(null)
  const setScene = useSceneStore((s) => s.setScene)
  const engine = useSceneStore((s) => s.engine)
  const gridSize = useSceneStore((s) => s.gridSize)

  const cancel = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setState(INITIAL)
  }, [])

  const dismissError = useCallback(() => setState((s) => ({ ...s, error: null, active: false })), [])

  const start = useCallback(
    async (file: File) => {
      abortRef.current?.abort()
      abortRef.current = null
      const issue = validateUpload(file)
      if (issue) {
        setState({ ...INITIAL, active: true, stage: 'error', error: issue.message, filename: file.name })
        return
      }

      const controller = new AbortController()
      abortRef.current = controller

      setState({
        active: true,
        stage: 'preprocessing',
        progress: 0,
        detail: 'Opening file',
        filename: file.name,
        error: null,
      })

      try {
        const scene = await processUpload(file, {
          engine,
          gridSize,
          signal: controller.signal,
          onStage: (stage, progress, detail) => {
            if (!controller.signal.aborted) setState((s) => ({ ...s, stage, progress, detail: detail ?? s.detail }))
          },
        })
        if (controller.signal.aborted) return
        setScene(scene)
        setState((s) => ({ ...s, stage: 'ready', progress: 1, detail: 'Scene ready' }))
        // Hold the completed state briefly so the last stage is readable.
        setTimeout(() => { if (abortRef.current === controller) { setState(INITIAL); abortRef.current = null } }, 900)
      } catch (err) {
        if (controller.signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
          return
        }
        setState((s) => ({
          ...s,
          stage: 'error',
          error:
            err instanceof Error
              ? err.message
              : 'Processing failed for an unknown reason. The file may be malformed.',
        }))
      }
    },
    [engine, gridSize, setScene],
  )

  useEffect(() => () => abortRef.current?.abort(), [])

  return { state, start, cancel, dismissError }
}

/**
 * Whole-window drag detection.
 *
 * Uses a counter rather than a boolean because dragenter/dragleave fire for
 * every nested element the pointer crosses; a naive boolean flickers the whole
 * interface as the cursor moves over the page.
 */
export function useGlobalDrag(onFile: (file: File) => void) {
  const [dragging, setDragging] = useState(false)
  const depth = useRef(0)

  useEffect(() => {
    const hasFiles = (e: DragEvent) =>
      Array.from(e.dataTransfer?.types ?? []).includes('Files')

    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth.current++
      setDragging(true)
    }
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth.current = Math.max(0, depth.current - 1)
      if (depth.current === 0) setDragging(false)
    }
    const onOver = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
    }
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth.current = 0
      setDragging(false)
      const file = e.dataTransfer?.files?.[0]
      if (file) onFile(file)
    }

    window.addEventListener('dragenter', onEnter)
    window.addEventListener('dragleave', onLeave)
    window.addEventListener('dragover', onOver)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onEnter)
      window.removeEventListener('dragleave', onLeave)
      window.removeEventListener('dragover', onOver)
      window.removeEventListener('drop', onDrop)
    }
  }, [onFile])

  return dragging
}
