import {
  DEFAULT_GRID,
  buildDemoScene,
  deleteSyntheticWorkRun,
  getSyntheticWorkRun,
  loadBackendDemo,
  startSyntheticWorkRun,
} from './api'

/**
 * Pipeline-facing boundary for the current deterministic presentation flow.
 *
 * The functions below retain the prototype implementation and its existing
 * local endpoints. They are the single replacement point for a future backend
 * job API; this module does not model or invoke AI, GIS, calibration, or DSM
 * processing.
 */
export const runDemo = (signal?: AbortSignal) => loadBackendDemo(signal)
export const startPrototypeJob = () => startSyntheticWorkRun()
export const getJobStatus = (workId: string) => getSyntheticWorkRun(workId)
export const deletePrototypeJob = (workId: string) => deleteSyntheticWorkRun(workId)

// The canonical browser demo remains unchanged. The scene store uses this
// export so demo creation is also reached through the pipeline boundary.
export { DEFAULT_GRID, buildDemoScene }

export type {
  ProcessedSyntheticRecord,
  SyntheticEvent,
  SyntheticInputRecord,
  SyntheticStage,
  SyntheticStatus,
  SyntheticWorkRun,
} from './api'
