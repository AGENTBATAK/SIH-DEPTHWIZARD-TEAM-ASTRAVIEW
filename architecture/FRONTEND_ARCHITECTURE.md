# DepthWizard — Frontend Service Architecture

## Phase 2 purpose

Phase 2 establishes a frontend-facing service boundary without changing the existing presentation prototype. It does not add AI, GIS, calibration, DSM generation, a production backend, a database, dependencies, or Three.js changes.

## Current dependency direction

```text
UI components and pages
        ↓
Hooks / Zustand state / local component state
        ↓
Focused frontend services
        ↓
Existing api.ts mock implementation
        ↓
Existing local presentation backend or deterministic browser demo
```

The lower layer currently remains a prototype. The separation ensures future backend work replaces service implementation rather than rewriting the upload, result, and visualization UI.

## Service responsibilities

| Module | Public role | Current delegate | Future replacement point |
|---|---|---|---|
| `frontend/services/uploadService.ts` | Validate and process an uploaded image | `api.ts` preview decoding and `POST /api/process` prototype behavior | Upload/project creation API adapter |
| `frontend/services/pipelineService.ts` | Run the demo, start/read/delete synthetic prototype jobs, provide the canonical browser demo | `api.ts` deterministic demo and `/api/demo-runs` behavior | Job creation, status, cancellation, and result API adapter |
| `frontend/services/resultService.ts` | List, fetch, and delete saved prototype scenes | `api.ts` `/api/scenes` calls | Persisted result/artifact API adapter |
| `frontend/services/api.ts` | Low-level existing mock implementation and wire-scene hydration | Existing local presentation backend and browser mock generator | May become a private transport/mock implementation once a real adapter exists |

No UI component should need to know the local endpoint names or transport/hydration details outside these services.

## UI call paths

### Upload

```text
DropZone / UploadSection
        ↓
useUpload
        ↓
uploadService.validateUpload / processUpload
        ↓
api.validateFile / processScene
        ↓
Existing preview + synthetic-scene implementation
```

The existing allowed formats, 64 MB limit, browser preview, cancellation, processing overlay, error messages, and synthetic upload result remain unchanged.

### Demo and synthetic workflow

```text
DemoPipeline                       SyntheticWorkflow
        ↓                                  ↓
pipelineService.runDemo             pipelineService prototype-job methods
        ↓                                  ↓
Existing demo endpoint               Existing local synthetic-workflow endpoint
        ↓
Canonical deterministic browser demo in the shared scene store
```

The demo still verifies the local presentation backend and then uses the existing deterministic browser terrain. The synthetic workflow remains a separate fixture-driven demonstration with its current polling interval and event display.

### Results

```text
SavedScenes
        ↓
resultService
        ↓
Existing saved-scene transport and hydration
        ↓
Zustand scene store
        ↓
Map and Three.js viewers
```

The renderer continues to consume `Scene`/`TerrainData` from the Zustand store. It does not know whether the scene came from a demo, upload, or future backend result.

## State ownership

| State category | Current owner | Examples |
|---|---|---|
| Project/result state | Zustand `useSceneStore` | Current scene, source image, saved loaded result |
| Pipeline-style state | Zustand and `useUpload` | Shared stage/progress fields; upload active/progress/detail/error/cancellation |
| Visualization state | Zustand + `TerrainViewer` local state | Layers, ramp, exaggeration, selected tool, camera mode; fullscreen and pointer-lock lifecycle |
| UI state | Local components | Demo step presentation, synthetic-workflow tab/polling state, saved-scene loading state |

This preserves the existing single Zustand store and local state where it is already scoped correctly. No new global state system was introduced.

## Types and status

`frontend/src/types/index.ts` already contains the project’s actual shared domain types, including `Scene`, `TerrainData`, `DSMResult`, `DepthResult`, `ValidationMetrics`, `PipelineStage`, and provenance-tagged values. Phase 2 does not introduce invented future-job types.

The current prototype stage names remain unchanged:

```text
idle → preprocessing → depth-inference → scale-calibration
     → dsm-generation → terrain-mesh → ready
```

They describe the existing presentation flow only. Future backend statuses may map to the target system's validation/GIS/calibration/DSM stages when those systems genuinely exist.

## Error boundary

The existing service request helper remains the normalization point for transport errors: it preserves API error messages when available and returns the current user-facing local-backend message on connection failure. Hooks and components retain their existing fallback messages and never display stack traces.

## Future backend connection

```text
Existing UI and hooks
        ↓
uploadService / pipelineService / resultService
        ↓
Future API adapter
        ↓
Job API and artifact contracts
        ↓
ML / GIS / calibration / DSM services
```

When added later, the real backend must return a result contract that the service layer can hydrate into the visualization-facing scene contract, including provenance, units, metadata, valid-data information, and job status. Three.js remains a consumer of that payload; it must not become a processing layer.

## Explicit non-goals

- No Depth Anything V2 or other model runtime
- No GIS, CRS, reference DEM, calibration, or DSM implementation
- No real job API, worker, database, or artifact store
- No change to the demo terrain, upload behavior, endpoints, visual design, animations, map, Three.js renderer, camera, or flythrough
- No dependency addition or performance optimization
