import type { DepthEngine } from '../types'

// The prototype has no AI runtime. These labels are shared by the metadata panel.
export type EngineStatus = { state: 'idle' }
export const ENGINE_LABEL: Record<DepthEngine, string> = {
  simulated: 'SYNTHETIC PRESENTATION TERRAIN',
  'depth-anything-v2-small': 'NOT AVAILABLE IN PROTOTYPE',
}
export const ENGINE_NOTE: Record<DepthEngine, string> = {
  simulated: 'Generated terrain for presentation. No image geometry is inferred and no AI model runs.',
  'depth-anything-v2-small': 'AI inference is not part of this presentation prototype.',
}
