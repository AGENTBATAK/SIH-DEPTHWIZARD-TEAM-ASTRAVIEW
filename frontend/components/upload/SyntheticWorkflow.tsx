import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Check, Circle, Clipboard, Database, LoaderCircle, Play, RefreshCw, Trash2 } from 'lucide-react'
import {
  deletePrototypeJob,
  getJobStatus,
  startPrototypeJob,
  type SyntheticInputRecord,
  type ProcessedSyntheticRecord,
  type SyntheticStage,
  type SyntheticWorkRun,
} from '../../services/pipelineService'
import { Button } from '../ui/Button'
import { Panel, Tag } from '../ui/Primitives'
import { cn } from '../../lib/utils'

type Tab = 'input' | 'processing' | 'output'

const PIPELINE: Array<{ stage: SyntheticStage; label: string; complete: string }> = [
  { stage: 'generation', label: 'Synthetic Data', complete: 'Synthetic data generated' },
  { stage: 'validation', label: 'Validation', complete: 'Schema validated' },
  { stage: 'preprocessing', label: 'Preprocessing', complete: 'Data cleaned/preprocessed' },
  { stage: 'analysis', label: 'Analysis', complete: 'Analysis completed' },
  { stage: 'result', label: 'Result', complete: 'Result generated' },
]

const valid = (record: SyntheticInputRecord) =>
  record.tileX >= 0 && record.tileX < 10 && record.tileY >= 0 && record.tileY < 10 &&
  [record.brightness, record.reliefSignal, record.roughness].every(value => value >= 0 && value <= 1)

const timestamp = (value: string) => new Intl.DateTimeFormat(undefined, {
  hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
}).format(new Date(value))

function StageState({ run, step, index }: { run: SyntheticWorkRun; step: (typeof PIPELINE)[number]; index: number }) {
  const current = PIPELINE.findIndex(item => item.stage === run.stage)
  const complete = run.status === 'completed' || index < current
  const active = run.status === 'processing' && index === current
  return <div className="relative min-w-[136px] flex-1">
    {index < PIPELINE.length - 1 && <span aria-hidden className={cn('absolute left-[calc(50%+1.8rem)] top-4 hidden h-px w-[calc(100%-3.6rem)] lg:block', complete ? 'bg-cyan-core' : 'bg-line-bright')} />}
    <div className="relative flex flex-col items-center text-center">
      <span className={cn('grid size-8 place-items-center rounded-full border', complete ? 'border-cyan-core bg-cyan-core/10 text-cyan-core' : active ? 'border-amber-warn bg-amber-warn/10 text-amber-warn' : 'border-line-bright text-ink-faint')}>
        {complete ? <Check className="size-4" /> : active ? <LoaderCircle className="size-4 animate-spin" /> : <Circle className="size-3" />}
      </span>
      <span className={cn('mt-3 dw-label', complete ? 'text-cyan-core' : active ? 'text-amber-warn' : 'text-ink-faint')}>{step.label}</span>
      <span className="mt-1 max-w-[140px] text-[10px] leading-relaxed text-ink-faint">{complete ? step.complete : active ? `Running ${step.label.toLowerCase()}…` : 'Waiting'}</span>
    </div>
  </div>
}

export function SyntheticWorkflow() {
  const [run, setRun] = useState<SyntheticWorkRun | null>(null)
  const [tab, setTab] = useState<Tab>('processing')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const refresh = useCallback(async (workId: string) => {
    const next = await getJobStatus(workId)
    setRun(next)
    return next
  }, [])

  useEffect(() => {
    if (!run || run.status !== 'processing') return
    const id = window.setInterval(() => { void refresh(run.workId).catch(error => setError(error instanceof Error ? error.message : 'Could not refresh this run.')) }, 150)
    return () => window.clearInterval(id)
  }, [refresh, run])

  const start = async () => {
    setBusy(true)
    setError('')
    setCopied(false)
    try {
      const next = await startPrototypeJob()
      setRun(next)
      setTab('processing')
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not start synthetic processing.')
    } finally {
      setBusy(false)
    }
  }

  const reset = async () => {
    if (!run) return
    setBusy(true)
    try {
      await deletePrototypeJob(run.workId)
      setRun(null)
      setError('')
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not reset temporary data.')
    } finally {
      setBusy(false)
    }
  }

  const copyWorkId = async () => {
    if (!run) return
    try {
      await navigator.clipboard.writeText(run.workId)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setError('Could not copy the Work ID. Select it and copy manually.')
    }
  }

  const rawForComparison = useMemo(() => run?.inputRecords.find(valid) ?? null, [run])
  const processedForComparison = useMemo(() => rawForComparison && run?.output?.processedRecords.find(record => record.recordId === rawForComparison.recordId), [rawForComparison, run])

  return <div data-testid="synthetic-workflow"><SectionShell>
    <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <div className="flex flex-wrap items-center gap-2"><Tag tone="amber">SYNTHETIC DEMO DATA</Tag><span className="dw-label text-ink-faint">TEMPORARY · LOCAL · NO PERSONAL DATA</span></div>
        <h3 className="mt-4 font-display text-2xl tracking-[-0.03em] text-ink">SYNTHETIC DATA PROCESSING</h3>
        <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-ink-dim">Generate 100 terrain-observation records and watch the local backend validate, clean and analyse them. Every displayed status and event comes from that Work ID’s real server-side operations.</p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <Button variant="primary" size="sm" magnetic={false} disabled={busy || run?.status === 'processing'} icon={busy ? <LoaderCircle className="size-3.5 animate-spin" /> : <Play className="size-3.5" />} onClick={() => void start()}>
          {run ? 'Generate New Synthetic Dataset' : 'Process Synthetic Data'}
        </Button>
        {run && <Button variant="ghost" size="sm" magnetic={false} disabled={busy} icon={<Trash2 className="size-3.5" />} onClick={() => void reset()}>Reset</Button>}
      </div>
    </div>

    {error && <p role="alert" className="mt-5 border-l border-amber-warn/60 pl-3 text-xs leading-relaxed text-amber-warn">{error}</p>}

    {!run ? <div className="mt-6 grid min-h-44 place-items-center border border-dashed border-line-bright bg-void/40 p-7 text-center">
      <Database className="mb-3 size-7 text-cyan-core" />
      <p className="dw-label text-ink">READY FOR A NEW WORK RUN</p>
      <p className="mt-2 max-w-md text-xs leading-relaxed text-ink-faint">Click Process Synthetic Data to create a temporary record set and its unique Work ID.</p>
    </div> : <>
      <div className="mt-6 flex flex-col gap-4 border border-cyan-core/30 bg-cyan-core/[0.045] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="dw-label text-ink-faint">WORK ID</p>
          <p className="mt-1 font-mono text-lg text-cyan-core" aria-label={`Work ID: ${run.workId}`}>{run.workId}</p>
        </div>
        <div className="flex items-center gap-3">
          <Tag tone={run.status === 'completed' ? 'cyan' : run.status === 'failed' ? 'amber' : 'amber'}>{run.status === 'processing' ? 'STATUS: PROCESSING' : `STATUS: ${run.status.toUpperCase()}`}</Tag>
          <Button variant="outline" size="sm" magnetic={false} icon={copied ? <Check className="size-3.5" /> : <Clipboard className="size-3.5" />} onClick={() => void copyWorkId()}>{copied ? 'Copied' : 'Copy Work ID'}</Button>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2 border-b border-line pb-3" role="tablist" aria-label="Synthetic workflow views">
        {([['input', 'Input Data'], ['processing', 'Processing'], ['output', 'Processed Output']] as const).map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)} className={cn('rounded-full border px-3 py-2 dw-label transition-colors', tab === value ? 'border-cyan-core/50 bg-cyan-core/10 text-cyan-core' : 'border-transparent text-ink-faint hover:border-line-bright hover:text-ink-dim')}>{label}</button>)}
      </div>

      {tab === 'input' && <InputData run={run} />}
      {tab === 'processing' && <ProcessingData run={run} />}
      {tab === 'output' && <OutputData run={run} raw={rawForComparison} processed={processedForComparison ?? null} />}
    </>}
  </SectionShell></div>
}

function SectionShell({ children }: { children: ReactNode }) {
  return <Panel className="mt-6 p-5 sm:p-6" ticks>{children}</Panel>
}

function InputData({ run }: { run: SyntheticWorkRun }) {
  const highlighted = run.inputRecords.filter(record => !valid(record)).slice(0, 4)
  const rows = [...run.inputRecords.slice(0, 6), ...highlighted.filter(record => !run.inputRecords.slice(0, 6).includes(record))]
  return <div className="mt-6">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-ink-dim">Temporary terrain-observation fixture generated on the backend for <span className="font-mono text-cyan-core">{run.workId}</span>.</p><Tag>{run.inputRecords.length} RAW RECORDS</Tag></div>
    <div className="overflow-x-auto border border-line"><table className="w-full min-w-[760px] text-left text-[11px]"><thead className="bg-white/[0.03] text-ink-faint"><tr>{['Record', 'Tile', 'Brightness', 'Relief signal', 'Roughness', 'Schema state'].map(label => <th key={label} className="px-3 py-2.5 font-mono font-normal uppercase tracking-[0.12em]">{label}</th>)}</tr></thead><tbody className="divide-y divide-line">{rows.map(record => <tr key={record.recordId} className={valid(record) ? 'text-ink-dim' : 'bg-amber-warn/[0.06] text-amber-warn'}><td className="px-3 py-2.5 font-mono">{record.recordId}</td><td className="px-3 py-2.5">{record.tileX}, {record.tileY}</td><td className="px-3 py-2.5">{record.brightness}</td><td className="px-3 py-2.5">{record.reliefSignal}</td><td className="px-3 py-2.5">{record.roughness}</td><td className="px-3 py-2.5">{valid(record) ? 'Valid' : 'Rejected by schema'}</td></tr>)}</tbody></table></div>
  </div>
}

function ProcessingData({ run }: { run: SyntheticWorkRun }) {
  return <div className="mt-7">
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <div className="flex flex-1 flex-wrap justify-between gap-y-6">{PIPELINE.map((step, index) => <StageState key={step.stage} run={run} step={step} index={index} />)}</div>
      <div className="grid shrink-0 grid-cols-2 gap-x-7 gap-y-4 border-l border-line pl-0 text-right sm:grid-cols-3 lg:grid-cols-1 lg:pl-6"><Metric label="Records received" value={run.validation.recordsReceived} /><Metric label="Valid records" value={run.validation.validRecords} /><Metric label="Rejected records" value={run.validation.rejectedRecords} /><Metric label="Processing time" value={run.processingTimeMs === null ? 'Running' : `${run.processingTimeMs.toFixed(2)} ms`} /></div>
    </div>
    <details className="mt-7 border border-line bg-void/30" open={run.status === 'processing'}>
      <summary className="cursor-pointer px-4 py-3 dw-label text-ink">VIEW PROCESSING DETAILS <span className="ml-2 text-ink-faint">({run.events.length} backend events)</span></summary>
      <ol className="max-h-64 divide-y divide-line overflow-y-auto border-t border-line">{run.events.map((event, index) => <li key={`${event.timestamp}-${index}`} className="grid grid-cols-[auto_auto_1fr] gap-x-3 px-4 py-2.5 font-mono text-[11px] leading-relaxed"><time className="text-ink-faint">{timestamp(event.timestamp)}</time><span className="text-cyan-core">{event.workId}</span><span className={event.stage === 'error' ? 'text-amber-warn' : 'text-ink-dim'}>{event.message}</span></li>)}</ol>
    </details>
  </div>
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return <div><p className="dw-label text-ink-faint">{label}</p><p className="mt-1 font-mono text-sm text-ink">{value}</p></div>
}

function OutputData({ run, raw, processed }: { run: SyntheticWorkRun; raw: SyntheticInputRecord | null; processed: ProcessedSyntheticRecord | null }) {
  if (!run.output) return <div className="mt-8 border border-dashed border-line-bright p-7 text-center"><RefreshCw className="mx-auto size-5 animate-spin text-amber-warn" /><p className="mt-3 text-xs text-ink-dim">The backend has not generated output yet. Switch to Processing to see the active stage.</p></div>
  const result = run.output.result
  return <div className="mt-6 space-y-6">
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-4"><Result label="Processed records" value={run.output.processedRecords.length} /><Result label="Dominant terrain" value={result.dominantTerrainClass} /><Result label="Average index" value={result.averageElevationIndex.toFixed(4)} /><Result label="Mean brightness" value={result.meanBrightness.toFixed(1)} /></div>
    {raw && processed && <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_auto_1fr] lg:items-stretch"><RecordCard title="RAW SYNTHETIC RECORD" lines={[raw.recordId, `brightness ${raw.brightness}`, `relief ${raw.reliefSignal}`, `roughness ${raw.roughness}`]} /><div className="grid place-items-center text-center"><span className="dw-label text-cyan-core">NORMALIZED + CLASSIFIED</span><span className="mt-2 text-lg text-cyan-core">→</span></div><RecordCard title="FINAL PROCESSED RECORD" lines={[processed.recordId, `normalized brightness ${processed.normalizedBrightness}`, `elevation index ${processed.elevationIndex}`, `terrain class ${processed.terrainClass}`]} accent /></div>}
    <div className="overflow-x-auto border border-line"><table className="w-full min-w-[720px] text-left text-[11px]"><thead className="bg-white/[0.03] text-ink-faint"><tr>{['Record', 'Normalized brightness', 'Elevation index', 'Terrain class'].map(label => <th key={label} className="px-3 py-2.5 font-mono font-normal uppercase tracking-[0.12em]">{label}</th>)}</tr></thead><tbody className="divide-y divide-line">{run.output.processedRecords.slice(0, 8).map(record => <tr key={record.recordId} className="text-ink-dim"><td className="px-3 py-2.5 font-mono text-ink">{record.recordId}</td><td className="px-3 py-2.5">{record.normalizedBrightness}</td><td className="px-3 py-2.5">{record.elevationIndex}</td><td className="px-3 py-2.5 text-cyan-core">{record.terrainClass}</td></tr>)}</tbody></table></div>
  </div>
}

function Result({ label, value }: { label: string; value: string | number }) {
  return <div className="border border-line bg-void/30 p-4"><p className="dw-label text-ink-faint">{label}</p><p className="mt-2 font-mono text-base text-cyan-core">{value}</p></div>
}

function RecordCard({ title, lines, accent = false }: { title: string; lines: string[]; accent?: boolean }) {
  return <div className={cn('border p-4', accent ? 'border-cyan-core/40 bg-cyan-core/[0.05]' : 'border-line bg-void/30')}><p className="dw-label text-ink-faint">{title}</p>{lines.map(line => <p key={line} className={cn('mt-2 font-mono text-xs', accent ? 'text-cyan-core' : 'text-ink-dim')}>{line}</p>)}</div>
}
