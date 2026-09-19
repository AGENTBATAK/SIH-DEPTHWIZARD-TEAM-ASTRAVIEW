# DepthWizard — Three.js Performance Audit

## Performance goals

Maintain the current terrain quality and interaction model while reducing avoidable allocation, preserving one active WebGL canvas in the normal page flow, and keeping React out of per-frame rendering state.

## Renderer and scene baseline

The source has two React Three Fiber `Canvas` definitions:

1. `StageCanvas` for the landing-page prologue and hero.
2. `TerrainViewer` for embedded and full explorer terrain rendering.

They are React Three Fiber-managed renderers; there is no manually constructed `WebGLRenderer` or hand-written global `requestAnimationFrame` render loop. The existing lifecycle browser check is designed to ensure one WebGL canvas is active while traversing the landing sections.

Explorer configuration uses opaque, antialiased, high-performance WebGL with no stencil buffer, DPR `[1, 1.8]` (maximum 1.3 on coarse pointers), and a perspective camera. The stage uses equivalent WebGL preferences with DPR `[1, 2]`. Neither current renderer config enables shadows or explicit tone mapping/color-space output settings.

## Current bottlenecks found

1. **Flythrough per-frame allocation:** `FlythroughController` created a new `THREE.Vector3` acceleration value during every active frame.
2. **Picking allocation:** `TerrainInteraction` already coalesced pointer events, but each actual ray-march created a new `THREE.Vector2` and `THREE.Raycaster`.
3. **Known but intentionally unchanged:** the canonical 1024² source height field, derived-raster generation, texture upload, JSON scene transport, CPU terrain picking, and large optional globe texture remain the main potential future costs. They were not changed because altering them could affect quality, fidelity, or presentation behavior.

## Changes made

### Reused flythrough acceleration vector

`FlythroughController` now owns one memoized acceleration vector and resets it before calculating movement each frame. This removes one transient object allocation per active flythrough frame without changing velocity, collision, terrain-following, keyboard, touch, mouse-look, or HUD behavior.

### Reused picker objects

`TerrainInteraction` now owns one memoized NDC vector and raycaster for the component lifetime. Pointer-move coalescing remains unchanged: at most one ray-march is still scheduled per animation frame. Click measurement and structure inspection use the same calculation with the reused objects.

## Resource management

Existing cleanup was retained and audited:

- Terrain height/LUT textures, terrain materials, LOD planes, and wire geometry are disposed by `TerrainSurface`.
- Particle and starfield buffer geometries/canvas textures are disposed by their components.
- Globe shader/material resources are disposed by `Globe`; loader-managed source maps are not explicitly disposed as shared loader resources.
- Flythrough keyboard, mouse, pointer-lock, and fullscreen listeners are removed on cleanup; pointer lock is released when appropriate.
- Terrain interaction removes pointer listeners and cancels a pending pointer-frame callback.
- React Three Fiber owns canvas, scene-object, renderer-size, camera-aspect, and render-loop lifecycle.

No shared texture was newly disposed, and no renderer is manually created or destroyed outside React Three Fiber.

## Render-loop strategy

React Three Fiber provides the single render loop per mounted canvas. `useFrame` updates shader uniforms, LOD selection, prologue motion, camera motion, flythrough state, and particles directly. High-frequency values use refs or Three.js objects; React state is updated only where UI must change, such as throttled flythrough readouts or a marker crossing the screen boundary.

No duplicate `requestAnimationFrame` render loop exists. The only explicit animation-frame callback is the coalesced pointer-picking scheduler, which is cancelled on unmount and does not render a scene itself.

## Geometry and texture strategy

- The terrain uses GPU displacement from a height texture rather than CPU vertex mutation.
- Existing distance-based LOD uses prebuilt 95, 191, 383, and 511 segment planes; the highest level is approximately 262,144 vertices. This was retained unchanged.
- Custom shader materials, height textures, RGB context textures, and LUT textures are memoized around their inputs.
- Existing texture filters and anisotropy were retained to preserve the visual result.
- No downsampling, mesh simplification, texture compression, or resolution reduction was applied.

## React ↔ Three.js boundary

React owns routes, panels, controls, navigation, and user-facing state. Zustand supplies durable scene and visualization settings. Three.js/React Three Fiber owns cameras, meshes, materials, render-loop work, raycasting, and pointer-lock behavior. Phase 3 strengthens this boundary by keeping transient raycaster/vector objects within the Three.js components rather than allocating them during interaction/frame work.

## Testing and measurements

### Measured before and after

`npm run perf:demo` reports the following for the canonical 1024² demo explorer in its Playwright scenario:

| Metric | Before | After |
|---|---:|---:|
| Canvas count | 1 | 1 |
| Captured console errors | 0 | 0 |
| Recorded long tasks | 0 | 0 |
| Maximum recorded long task | 0 ms | 0 ms |
| Maximum pipeline long task | 0 ms | 0 ms |

The test confirms the demo scene identity and grid resolution. It does not measure FPS, GPU memory, texture count, renderer-info counters, or exact initial render time; those values are **Not measured**.

### Regression checks

- `npm run build` passed.
- `npm run test:backend` passed (3 of 3 tests).
- `npm run perf:demo` passed before and after the change.
- `npm run smoke:explorer` completed without a reported failure after the change. Its existing coverage exercises orbit, zoom, pan, measurement, inspection, desktop flythrough, mobile touch controls, and canvas-count assertions.

The development-server log emitted an existing `THREE.Clock` deprecation warning from the installed runtime stack. Project source does not instantiate `THREE.Clock`, browser checks captured no console **errors**, and no dependency update was made in this phase to avoid changing renderer behavior.

## Remaining opportunities

- Add controlled GPU/CPU profiling on representative presentation hardware before changing terrain LOD or texture policy.
- Define an artifact/tile format before attempting large real DSM visualization.
- Replace JSON raster transport only when a real backend artifact contract exists.
- Evaluate the large globe texture and canonical terrain generation on low-memory devices with measured evidence before applying any quality trade-off.
- Keep renderer contexts separated by route/section lifecycle; do not merge or replace the current stage/explorer canvas design without visual regression testing.
- Address the upstream `THREE.Clock` deprecation warning during a separately scoped dependency compatibility review.
