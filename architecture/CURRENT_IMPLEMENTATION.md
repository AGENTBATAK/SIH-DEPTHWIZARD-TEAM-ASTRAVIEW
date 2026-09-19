# DepthWizard — Current Implementation Audit

## Scope and status

This document describes the implementation that exists in the presentation prototype today. It is deliberately separate from the target architecture documents in this directory.

The current application does **not** run Depth Anything V2, GIS processing, metric calibration, DSM generation, or a production backend. Its image, depth, terrain, reference, calibration, and validation products are deterministic prototype data. UI copy and type provenance identify this limitation.

## Current pages and routes

| Route | Component | Purpose |
|---|---|---|
| `/` | `frontend/pages/Landing.tsx` | Scroll-led landing experience: prologue, hero, explainer sections, upload, demo workflow, embedded viewer, analytics, calibration explanation, architecture, applications, research, and call to action. |
| `/explorer` | `frontend/pages/Explorer.tsx` | Full-viewport map/terrain explorer with layers, inspection, measurement, fullscreen, provenance, orbit controls, and flythrough. |
| `*` | `frontend/src/App.tsx` | Falls back to the landing page. |

`App` renders a boot screen before the routes and ensures a demo scene exists when boot completes. The navigation is hidden on `/explorer` to keep that route focused on the instrument UI.

## Current component groups

| Area | Location | Responsibility |
|---|---|---|
| Application shell | `frontend/src/App.tsx` | Boot lifecycle, routing, persistent cursor, navigation visibility. |
| Pages | `frontend/pages/` | Landing composition and full explorer route. |
| Reusable UI | `frontend/components/ui/` | Buttons, panels, section primitives, tags, metrics, provenance presentation, reveal helpers. |
| Narrative sections | `frontend/components/{hero,sections,storytelling,compare,analytics,calibration,architecture,applications,research,cta}/` | Existing visual narrative and computed prototype readouts. |
| Upload and processing | `frontend/components/upload/`, `frontend/components/processing/` | File selection, metadata, saved scenes, deterministic demo workflow, synthetic-record workflow, processing overlay. |
| Navigation and boot | `frontend/components/{navigation,loading,cursor}/` | Global navigation, loading sequence, and cursor treatment. |
| Map | `frontend/components/map/MapPanel.tsx` | MapLibre-based 2D representation. |
| Three.js | `frontend/three/{terrain,prologue}/` plus `frontend/components/hero/HeroTerrain.tsx` | The prologue/hero stage, terrain viewer, shader, interaction, controls, and flythrough. |

The compatibility junctions under `frontend/src/` allow the historical relative imports to keep resolving while the code is physically grouped under `frontend/components`, `frontend/pages`, `frontend/services`, and `frontend/three`.

## Current user flow

```text
Landing
  ↓
Boot screen creates the canonical deterministic demo scene
  ↓
Upload section
  ├─ Upload PNG/JPEG/TIFF → preview decoding → prototype backend stores preview
  │                         → synthetic terrain scene → processing overlay
  └─ Run demo → verifies local backend → restores canonical browser demo
  ↓
Result and explanatory sections
  ↓
Embedded 3D terrain or /explorer
  ↓
Orbit / map / inspect / measure / flythrough
```

The synthetic-workflow panel is independent from image upload. It sends a generated fixture to the local presentation backend, polls the resulting Work ID, and displays validation/preprocessing/analysis events. It is not the future elevation pipeline.

## Current state

### Shared application state

`frontend/src/hooks/useScene.ts` defines a single Zustand store shared by the landing page and explorer route. It holds:

- the current `Scene` and pipeline-style status fields;
- the selected simulated depth engine and its status;
- render state: grid size, vertical exaggeration, colour ramp, layer toggles, 2D/3D mode, and camera mode;
- interaction state: cursor readout, measurements, pending measurement point, selected structure, and analytics transect;
- UI state: active tool and provenance visibility.

`loadDemo()` uses `buildDemoScene()` with the canonical seed and 1024-square source grid. `setScene()` accepts the hydrated scene returned by the existing upload path.

### Local component state

- `useUpload()` owns upload progress, error text, cancellation, and the `AbortController` for one upload request.
- `DemoPipeline` owns its presentation step state and navigation to the explorer.
- `SyntheticWorkflow` owns its active Work ID, polling, selected tab, and controls.
- `TerrainViewer` owns transient camera transition, fullscreen, flythrough, pointer-lock, touch, and panel state. Durable view preferences remain in Zustand.

## Current services

`frontend/services/api.ts` is the unchanged low-level mock implementation. It centralizes request handling, file validation, wire-to-typed-scene hydration, saved-scene operations, demo loading, synthetic work-run calls, and uploaded-scene processing. Phase 2 adds small UI-facing façades over it so components and hooks no longer need to know which mock operations share that implementation file.

| Function group | Current behavior |
|---|---|
| `validateFile` | Limits files to PNG/JPEG/TIFF and 64 MB. |
| `processScene` | Decodes an image preview in the browser; reads GeoTIFF display metadata when applicable; sends filename, dimensions, size, and PNG preview to `POST /api/process`. |
| Scene persistence | Lists, fetches, and deletes saved prototype scenes through `/api/scenes`. |
| Demo | Checks `POST /api/demo`, then the UI restores the canonical in-browser generated scene for visual consistency. |
| Synthetic work runs | Starts, reads, and deletes `/api/demo-runs` records; the UI polls while a run is active. |
| Local demo generation | `buildDemoScene` generates the coherent deterministic browser demo and caches up to three generated scenes. |

The local Node presentation backend is under `backend/api/` and `backend/api/prototype/`. It stores data locally and returns prototype scenes. It is not a job queue, ML/GIS worker, database, or production API.

## Current mock pipeline

### Demo scene

`buildDemoScene()` creates a seeded terrain height field, renders an RGB-like plate, derives a relative-depth grid from that terrain, creates a noisy/coarsened simulated reference DEM, fits scale/offset, and calculates prototype validation metrics. The output is internally coherent but simulated by construction.

### Upload path

An upload affects the displayed preview and stored-scene identity. The backend then generates repeatable **synthetic** terrain; its shape does not represent the uploaded image. GeoTIFF handling is limited to inspection and preview reading, not GIS processing.

### Prototype labels and claims

The application explicitly labels its demo, reference DEM, elevation, timings, and metadata with provenance such as `simulated`, `derived`, `reference`, or `measured`. No user-upload result should be interpreted as real elevation or a calibrated DSM.

## Future integration boundary

The existing safe seam is:

```text
UI components / hooks
        ↓
frontend/services/api.ts
        ↓
Current presentation backend and deterministic demo
```

Future work should preserve that seam while replacing only the service contract behind it:

```text
UI components / hooks
        ↓
pipeline service or API adapter
        ↓
Backend job API
        ↓
ML → GIS → calibration → DSM → validation artifacts
```

The renderer should receive a visualization-ready elevation payload derived from the authoritative DSM, not perform scientific processing itself.

## Phase 2 frontend service structure

The mock behavior, UI state, visible text, endpoints, and terrain renderer remain unchanged. The Phase 2 change is only the ownership of service calls:

```text
Upload components
        ↓
useUpload
        ↓
uploadService.ts
        ↓
api.ts mock implementation

Demo and synthetic-workflow components / scene store
        ↓
pipelineService.ts
        ↓
api.ts mock implementation

Saved-scenes component
        ↓
resultService.ts
        ↓
api.ts mock implementation
```

| Service | UI-facing responsibility | Existing implementation delegated to |
|---|---|---|
| `uploadService.ts` | Upload validation, supported extensions, and upload processing | `validateFile` and `processScene` in `api.ts` |
| `pipelineService.ts` | Demo handshake, synthetic prototype job status, canonical browser demo | `loadBackendDemo`, synthetic work-run methods, and `buildDemoScene` in `api.ts` |
| `resultService.ts` | List, load, and delete saved prototype scenes | Scene persistence methods in `api.ts` |

`PipelineStage` remains the prototype's existing stage union in `frontend/src/types/index.ts`. No real ML/GIS/DSM stage was added, because doing so would misrepresent the mock implementation. The existing `Scene`, `TerrainData`, upload metadata, results, and provenance types remain the shared type layer.

For a future backend, the façade modules—not UI components—are the intended replacement points. The future adapter must preserve the current display contracts while consuming real asynchronous job and result artifacts.

## Known implementation risks intentionally not changed in Phase 1

- The app uses a large 1024-square deterministic demo dataset; browser CPU, memory, and WebGL limits will matter for real large rasters.
- The presentation API transports terrain values as JSON arrays before hydrating typed arrays, which is not an appropriate large-raster transport format.
- Synthetic result and calibration terminology must remain visibly qualified until a real reference-driven pipeline exists.
- The application has no production authentication, persistence model, asynchronous worker queue, artifact store, or job-recovery policy.
