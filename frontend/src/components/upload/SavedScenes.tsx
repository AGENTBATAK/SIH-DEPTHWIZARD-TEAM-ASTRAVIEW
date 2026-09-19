import { useCallback, useEffect, useState } from 'react'
import { deleteSavedResult, getSavedResult, listSavedResults, type SavedScene } from '../../services/resultService'
import { useSceneStore } from '../../hooks/useScene'
import { Button } from '../ui/Button'
import { Panel } from '../ui/Primitives'

export function SavedScenes({ disabled }: { disabled: boolean }) {
  const sceneId = useSceneStore(s => s.scene?.id)
  const setScene = useSceneStore(s => s.setScene)
  const [scenes, setScenes] = useState<SavedScene[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const refresh = useCallback(async () => {
    setBusy(true)
    try { setScenes(await listSavedResults()); setError('') }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not load saved scenes.') }
    finally { setBusy(false) }
  }, [])
  useEffect(() => { void refresh() }, [refresh, sceneId, disabled])
  const act = async (id: string, remove = false) => {
    setBusy(true)
    setError('')
    try {
      if (remove) { await deleteSavedResult(id); setScenes(await listSavedResults()) }
      else setScene(await getSavedResult(id))
    } catch (err) { setError(err instanceof Error ? err.message : 'Scene request failed.') }
    finally { setBusy(false) }
  }
  return <Panel className="mt-6 p-5">
    <div className="flex items-center justify-between gap-4">
      <div><h3 className="dw-label text-ink">SAVED SCENES</h3><p className="mt-2 text-xs text-ink-faint">Stored on this computer. Reopen after a refresh or server restart.</p></div>
      <Button size="sm" variant="ghost" magnetic={false} disabled={busy || disabled} onClick={() => void refresh()}>Refresh scenes</Button>
    </div>
    {error && <p role="alert" className="mt-4 text-xs text-amber-warn">{error}</p>}
    {!error && scenes.length === 0 && <p className="mt-4 text-xs text-ink-dim" role="status">{busy ? 'Connecting to local backend…' : 'No saved scenes yet. Upload an image to create one.'}</p>}
    <ul className="mt-4 max-h-72 divide-y divide-line overflow-y-auto">
      {scenes.map(scene => <li key={scene.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
        <div className="min-w-0"><p className="max-w-md truncate text-sm text-ink">{scene.filename}</p><p className="mt-1 text-[11px] text-ink-faint">{new Date(scene.createdAt).toLocaleString()} · SYNTHETIC{sceneId === scene.id ? ' · VIEWING' : ''}</p></div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" magnetic={false} disabled={busy || disabled} onClick={() => void act(scene.id)}>Open scene</Button>
          <Button size="sm" variant="ghost" magnetic={false} disabled={busy || disabled} onClick={() => void act(scene.id, true)}>Delete saved scene</Button>
        </div>
      </li>)}
    </ul>
  </Panel>
}
