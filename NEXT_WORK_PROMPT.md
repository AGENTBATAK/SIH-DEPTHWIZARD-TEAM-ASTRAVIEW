# DepthWizard — Remaining Performance Work

Continue optimizing the existing React + Vite + React Three Fiber DepthWizard prototype in this repository. Treat the current working tree as the source of truth and preserve all existing user changes.

## Outcome

Finish the remaining performance validation and make only evidence-backed fixes needed for a stable presentation-laptop experience. Preserve the exact canonical demo result and every existing interaction.

The canonical demo contract is immutable:

- deterministic seed `26175`
- terrain size `1024²` and `1,048,576` samples
- unchanged RGB, relative-depth, calibrated DSM relationship
- unchanged generated structures and metrics
- unchanged terrain appearance, camera behavior, explorer controls, measurement, inspection, reset, orbit, zoom, pan, and flythrough result
- backend health/demo handshake remains part of the run

## Already Completed

Do not redo or revert these changes:

- `src/services/api.ts` caches exact generated demo scenes by seed and size, with a three-entry bound.
- `src/components/upload/DemoPipeline.tsx` prevents duplicate launches, aborts safely on unmount, renders status between stages, keeps the backend handshake, and reuses the already-warmed canonical scene and raster plates.
- `src/components/ui/Primitives.tsx` contains a current-visibility `IntersectionObserver` hook.
- Landing-page WebGL consumers now mount only near the viewport and unmount when far away:
  - `src/components/terrain/StageLayer.tsx`
  - `src/components/sections/ExplorerSection.tsx`
  - `src/components/storytelling/PixelsToElevation.tsx`
  - `src/components/cta/FinalCTA.tsx`
- `src/components/cursor/CustomCursor.tsx` avoids repeated React state updates when cursor state has not changed.
- `index.html` uses an inline empty favicon so browser validation has no favicon 404.
- `scripts/perf-demo.mjs` is the regression harness for the real landing-page demo path.

Latest desktop regression result:

```json
{
  "canonical": true,
  "canvasCount": 1,
  "maxPipelineLongTaskMs": 0,
  "maxLongTaskMs": 848,
  "consoleErrors": 0,
  "url": "http://[::1]:5173/explorer",
  "gridText": "GRID RESOLUTION\n1024²",
  "sceneText": "DEPTHWIZARD / DEMO_SCENE_01"
}
```

The original failing trace had a `18,705 ms` main-thread task during **Run Demo Pipeline**. The current pipeline trace has no long task.

## Remaining Work

### 1. Validate landing-page lifecycle

Extend the Playwright validation or add a focused companion script that scrolls the complete landing page at desktop size and records the number of mounted canvases at representative sections.

Completion criteria:

- no console or page errors
- no more than one active WebGL canvas at a time during the full-page scroll
- the stage, embedded explorer, elevation storytelling canvas, and final flyover unmount after leaving their visibility margins
- returning to a section remounts its canvas successfully
- no accumulating canvases, animation loops, WebGL contexts, listeners, or obvious retained scene resources after repeated scroll passes

If a lifecycle issue is observed, identify the owning component and make the smallest fix. Keep `IntersectionObserver` as the visibility mechanism.

### 2. Validate the full explorer interaction contract

Run the canonical demo through the real **Run Demo Pipeline** button, then exercise:

- orbit drag
- wheel zoom
- pan gesture
- Measure: select two terrain points and confirm a measurement appears
- Inspect: select a generated structure and confirm its structure card appears
- Reset: confirm camera returns to the established orbit pose
- Enter flythrough: wait for the existing transition, confirm flythrough HUD/readout, then exit back to orbit

Completion criteria:

- every interaction remains usable
- the scene stays `DEMO_SCENE_01` at `1024²`
- generated structures are present
- only one explorer canvas is mounted
- no console errors or uncaught page errors
- no change to camera constants, interaction semantics, terrain data, material output, or flythrough path

### 3. Validate desktop and mobile layouts

Test at least:

- desktop: `1440 × 900`
- mobile: `390 × 844`, coarse-pointer behavior if the harness supports it

Completion criteria:

- landing page can be scrolled end to end
- controls remain reachable and do not overlap critical readouts
- no horizontal document overflow
- mobile touch controls and layout render without console errors
- reduced-motion mode still bypasses cinematic motion correctly

Treat any intentionally smaller non-canonical preview used by responsive presentation code as separate from the canonical **Run Demo Pipeline** contract. Do not alter canonical demo resolution.

### 4. Measure memory and resource stability

Use browser-supported measurements when available; otherwise report observable proxies explicitly. Compare a settled baseline with the state after two complete landing-page scroll passes and one demo/explorer cycle.

Completion criteria:

- canvas/context counts return to their expected settled values
- no monotonic growth in detached canvases or event listeners
- no repeated creation of terrain geometry/textures caused by ordinary React re-renders
- the bounded scene cache remains bounded
- dispose paths for geometries, materials, textures, controls, observers, listeners, and manual animation frames are confirmed

Do not claim an exact RAM or VRAM figure unless it was measured by the browser or OS. Label estimates as estimates.

### 5. Run final checks

Run the repository's typecheck, build, backend tests, backend smoke test, and browser performance harness. Use the active local host; in this environment the verified frontend URL is `http://[::1]:5173`.

At minimum, rerun:

```powershell
npm run typecheck
npm run build
npm run test:backend
npm run smoke:backend
node scripts/perf-demo.mjs 'http://[::1]:5173'
```

The browser regression must end at `/explorer`, contain `1024²` and `DEMO_SCENE_01`, have one canvas, report zero console errors, and keep the pipeline below the harness long-task threshold.

## Change Guardrails

Use targeted fixes only. Preserve branding, layout, route structure, UI flow, terrain seed, height field, raster products, structures, visual quality, camera behavior, controls, and flythrough. Keep the existing adaptive mesh behavior. Avoid new dependencies and avoid broad refactors.

Do not use arbitrary timer-based progress. Yield only at real stage boundaries or chunk real work when evidence shows it is necessary. Do not replace the canonical generator with a lower-resolution backend result.

## Required Final Response

Use exactly these headings:

### ROOT CAUSE

State the observed causes with measurements.

### CHANGED

List only files actually changed in this continuation and what changed.

### PERFORMANCE FIXES

Report before/after long-task, canvas/context, responsiveness, and memory/resource findings.

### VALIDATION

Report each required command and interaction check as pass, fail, or not measurable. Explicitly confirm seed `26175`, `1024²`, `1,048,576` samples, structures, scene name, and all explorer controls.

### REMAINING

List only verified unresolved items. Write `None` if all checks pass.
