# DEPTHWIZARD

**Presentation Prototype · Interactive 3D Terrain**

SIH 2026 · Problem Statement `SIH26175` · ISRO · Disaster Management · Software

---

## What it is

DepthWizard is an interactive terrain presentation prototype with a working local backend. Uploaded images become saved scenes with a synthetic terrain surface; they are not reconstructed from image geometry.

```
IMAGE PREVIEW
      ↓
LOCAL BACKEND          saves preview + creates synthetic terrain
      ↓
SAVED SCENE            reopen or delete locally
      ↓
PRESENTATION RASTER    illustrative heights
      ↓
INTERACTIVE 3D TERRAIN orbit, flythrough, measure, inspect
```

All upload-derived terrain values are marked simulated. The prototype does not include a depth model, reference elevation source, GIS calibration, or accuracy claims.

## Presentation prototype

The current application implements the presentation workflow, not the proposed AI/GIS pipeline. The landing page explains the intended product; uploaded scenes use synthetic terrain unrelated to the image content. No AI weights, inference service, reference DEM downloads or GIS pipeline are required.

The existing seeded demo, 3D viewer, flythrough, layer controls, measurements and analytics are retained. Uploading an image now calls a real local Node backend, which generates a repeatable 256 x 256 synthetic surface and saves the scene to disk. The browser converts the returned arrays to typed rasters for the existing renderer. Error metrics for uploads are unavailable, rather than invented.

## Running it

Requires Node.js 22 or newer and npm.

```bash
npm install
npm run dev           # starts API on 127.0.0.1:3001 and frontend on localhost:5173
```

For a presentation from a production build:

```bash
npm run build
npm start             # opens frontend + API at http://127.0.0.1:3001
```

Open the printed URL in your browser. No keys or configuration are needed. After installing dependencies, the default presentation works without internet access.

### Presentation walkthrough

1. Start with the built-in coherent demo and open the explorer to demonstrate orbit, flythrough, layers and measurements.
2. Return to the overview and upload a PNG, JPG or TIFF (up to 64 MB).
3. The browser decodes the image and sends only a resized PNG preview plus original filename, size and dimensions. The original file is not stored.
4. The local server saves the preview and a synthetic surface. The current scene updates throughout the frontend.
5. Use **Saved scenes** to reopen or delete scenes. Reload the page or restart the server: saved scenes remain available, while the initial view starts with the built-in demo.

Deleting a saved scene removes its disk record; an already open scene remains visible until you switch scenes. Cancelling an upload stops the browser request; if the server has already saved it, it may still appear in Saved scenes.

### Backend API and storage

`backend/src/server.mjs` uses Node's HTTP and filesystem APIs, without a database or additional server dependencies. `server/index.mjs` remains a compatibility launcher. Records are atomically written to `.data/scenes/<uuid>.json` (gitignored). This is a local, single-user prototype, not a public multi-user service.

| Method | Endpoint | Result |
| --- | --- | --- |
| GET | `/api/health` | Presentation mode and service health |
| POST | `/api/upload` | Validate and persist a synthetic scene |
| POST | `/api/process` | Upload-compatible processing entry point |
| POST | `/api/demo` | Deterministic, local synthetic demo scene |
| POST | `/api/scenes` | Validate, generate and persist a scene |
| GET | `/api/scenes` | Saved scene summaries, newest first |
| GET | `/api/scenes/:id` | Complete scene, preview and raster data |
| DELETE | `/api/scenes/:id` | Delete a saved scene |
| POST | `/api/demo-runs` | Start a temporary synthetic-data processing run |
| GET | `/api/demo-runs/:workId` | Current run status, backend events, records and output |
| DELETE | `/api/demo-runs/:workId` | Reset temporary synthetic run data |

Create requests contain `{ filename, width, height, bytes, preview }`; `preview` is a PNG data URL, at most 1024 x 1024. The JSON request limit is 7 MB. Dimensions and original byte count are browser-reported metadata. The API validates fields and the PNG header, while image decoding happens in the browser. Raster values are JSON arrays; missing validation metrics are `null`, restored to `NaN` by the frontend so they render as unavailable. Terrain reuses the DSM height array after hydration.

Backend environment variables: `PORT` (default `3001`) and `DATA_DIR` (default `.data/scenes`). Set these in the process environment; the backend does not load `.env` files. If changing the port during development, update the proxy target in `vite.config.ts` too. `npm run dev:backend` and `npm run dev:frontend` can run each side separately. `npm run preview` requires a separately running backend.

### Synthetic Data Processing Workflow

The **Process Synthetic Data** panel is intended for SIH judging. It creates a temporary local work run with a unique `WORK-SIH-2026-xxxxx` identifier and 100 terrain-observation fixture records. Four deliberately malformed fixture records are rejected by the server’s schema validation; the remaining 96 records are normalized and classified as lowland, slope, or ridge.

The panel shows the raw fixture, its real server-generated event trail, validation counts, processing time, and a raw-to-processed record comparison. Every event includes the same Work ID. **Generate New Synthetic Dataset** creates a new Work ID and deterministic fixture variation; **Reset** removes the temporary in-memory run. No real people, user data, external datasets, model inference, or GIS data is used.

## Environment variables

Optional frontend variables are documented in `.env.example`. By default the map uses the local hillshaded surface and makes no tile requests. To opt into an external basemap, configure `VITE_MAP_STYLE_URL` or `VITE_MAPTILER_KEY` in `.env.local`.

## Verification

```bash
npm run test:backend   # CRUD, restart persistence, raster contract and invalid requests
npm run build          # type checking and production bundle
npm run smoke:backend  # browser upload, saved-scene reopening, explorer and deletion; dev server required
npm run smoke          # existing full frontend smoke suite; dev server required
```

Browser checks use Playwright Core and require an installed Chromium browser. `BROWSER_PATH` can specify an executable for the prototype smoke test. Screenshots go to `smoke/`.

---

## Design decisions worth knowing about

### The demo scene is internally true, not staged

Everything in demo mode descends from **one seeded height field**:

- the "satellite" RGB plate is an orthographic render of it
- the depth map is its true relative depth (for a nadir view, normalised
  elevation *is* relative depth — this is ground truth, not an estimate)
- the DSM is that same raster
- the mesh you fly through is that same raster

So the `image → depth → elevation → terrain` sequence the site shows is a real
transformation of real data. Nothing has to be faked, and nothing has to be
over-claimed. The scene is deterministic from its seed, so it renders identically
every time.

### The opening descent is one continuous shot

The landing page opens in orbit and scrolls down onto the demo terrain. The
tempting way to build that is two canvases with a cross-dissolve at the bottom;
the problem is that two WebGL contexts cannot share a camera, so the moment of
arrival — the one moment the illusion has to survive — becomes a cut.

Instead there is a single `StageCanvas` behind both sections, placed by
`StageLayer`. It is `sticky` rather than `fixed`: a fixed canvas stays nailed to
the viewport while the sections below scroll over it, so the opaque top edge of
the next section reads as a panel sliding across a frozen terrain instead of the
page moving.

Sticky alone is not enough either. When the wrapper ends the canvas unsticks and
scrolls away as a rectangle, and a 3D scene sliding upward shows you its own
edges and the black around them — which says "this was a small object on a page"
immediately after the descent spent 320vh saying "this is a place". So the stage
also fades as the hero leaves. The illusion ends deliberately rather than by
revealing the trick. One camera flies
the whole way down, and the terrain fades up beneath it. `SpacePrologue` renders
almost nothing itself: it converts scroll into a single number, and everything
else — camera, globe, atmosphere, star opacity, terrain assembly — is a pure
function of that number in `prologue/descent.ts`. Scrubbing backwards therefore
retraces the flight exactly, because there is no animation state anywhere that
can drift out of step with the scrollbar.

**The handoff goes through nadir, and through cloud.** The camera descends to
straight-down before the swap, so the globe surface and the terrain plate are
both top-down imagery rather than a sphere dissolving into an obliquely-viewed
plane. That leaves "flat becomes three-dimensional" as the only thing that
visibly changes, which is the product's entire claim. The descent also passes
through a cloud wash that covers the swap outright, because a whole-Earth plate
cannot stay sharp down to a 4 km footprint — a 10,000x zoom no texture survives
at any resolution. One gradient does the job and is what actually happens on the
way down.

Three details carry that moment, and each was a visible failure first:

- **Opacity had to be decoupled from assembly.** The terrain shader multiplied
  alpha by `uRise`, so a surface at rise 0 was invisible rather than flat. The
  cloud cleared onto an empty frame and the terrain only appeared as it rose —
  there was no flat plate at all. `uRiseFade` now selects the behaviour: the
  hero's boot still fades in as it assembles, the descent does not.
- **The camera holds at nadir before it tilts.** A 1x1 plane only overfills the
  viewport from directly above it, so any camera movement during the flat beat
  swings the plate's far corner into frame as a dark wedge. Nothing moves until
  there is relief to justify the new angle.
- **Nadir height is computed from the aspect ratio, and the tilt is a ratio of
  that height.** A fixed hold height shows the plate's edges on anything wider
  than 4:3; a fixed tilt offset gets proportionally steeper as the hold height
  drops for wide viewports, which widens the far side past the edge again.
  `nadirHeightFor` handles the first, `NADIR_Z_RATIO` the second.

The numbers on screen are the scene's own. The descent ends at 1802 m because
that is where the hero camera actually sits (`y = 0.44` over a 4096 m scene), and
it starts at geostationary altitude because that is where INSAT — the
constellation India flies for disaster monitoring — actually is, with the globe
scaled so its angular size matches. A project whose entire argument is that it
never overstates a figure cannot open on a number that contradicts its own frame.

The globe is theatrically scaled rather than physically placed: it grows and
closes instead of the camera crossing 36,000 km. A truthful scale would need a
second camera frustum, since a 6371 km sphere and a 4 km terrain cannot share a
depth buffer, and it would buy nothing an audience can see. Keeping one frustum
means terrain depth precision is exactly what it was before the prologue existed.

### Every number carries its provenance

`Tagged<T>` in `src/types/index.ts` is the core type:

```ts
type Provenance = 'measured' | 'derived' | 'reference' | 'simulated'
interface Tagged<T> { value: T; provenance: Provenance; unit?: string; note?: string }
```

The `<Metric>` component reads the source tag **off the value**, not off a prop.
A developer adding a new panel cannot forget to label a simulated figure, because
they were never able to pass a bare `number`. The `PROVENANCE` toggle in the
header lights up every value on screen by source.

### Error metrics are computed, never invented

RMSE, MAE and correlation are calculated at request time over the actual rasters,
against the reference surface named next to them. When no reference elevation
covers a scene, those fields show `—` and say why. There are no stored benchmark
figures anywhere in this repository.

### Uploaded scenes are explicitly synthetic

The presentation backend hashes the uploaded preview to choose a repeatable procedural surface. This is not shape-from-shading, learned depth, or reconstructed geometry. Its elevations, scale and map placement are illustrative. The upload UI and provenance tags explain this before and after upload. GeoTIFFs are decoded only for display; georeferencing and elevation bands do not drive a GIS pipeline.

The AI runtime and live-inference control have been removed. The retained `referenceDem.ts` utility is not called by the prototype.

---

## Architecture

```
src/
  components/
    analytics/      charts, validation panel, 2D elevation map
    applications/   disaster scenarios, computed live from the raster
    architecture/   interactive pipeline diagram
    calibration/    scroll-scrubbed alignment visualisation
    compare/        RGB ↔ derived-product comparator
    cta/            closing flyover + footer
    cursor/         custom cursor
    hero/           hero section + hero terrain contents
    prologue/       space -> terrain descent (see below)
    loading/        boot sequence
    map/            MapLibre panel with DSM overlay
    navigation/     header
    processing/     cinematic pipeline overlay
    research/       dependency wall
    sections/       why / explorer / measurement
    storytelling/   pixels → elevation scrollytelling
    terrain/        the 3D engine (see below) + the shared stage canvas
    ui/             Metric, Button, primitives
  hooks/
    useScene.ts       zustand store, shared by both routes
    useSmoothScroll.ts Lenis ↔ GSAP ScrollTrigger integration
    useUpload.ts      upload orchestration, abort handling, drag detection
  lib/
    noise.ts        seeded simplex + fBm + ridged multifractal
    terrain.ts      height field generation, hillshade, slope, metrics
    raster.ts       satellite / scalar / elevation-map renderers
    raycast.ts      CPU ray-marching against the height field
    colormaps.ts    scientific ramps (no rainbow)
    plates.ts       derived-raster cache
  services/
    api.ts          HTTP adapter, raster hydration and built-in demo
    depth.ts        prototype engine labels
    geotiff.ts      GeoTIFF inspection + UTM inverse projection
    referenceDem.ts terrain tile fetch and decode
  routes/
    Landing.tsx     the scroll narrative
    Explorer.tsx    the full-viewport tool
```

### The 3D engine

- **GPU displacement.** The height field is uploaded as a normalised half-float
  (`R16F`) texture and displaced in the vertex shader. That is what makes the
  exaggeration slider instant over a 1024² field and lets the scroll-driven
  assembly animate a million vertices without touching a buffer per frame.
  `R16F` rather than `R32F` because WebGL2 guarantees the former is linearly
  filterable.
- **1024² height field, adaptively tessellated.** The terrain function is
  continuous, so sampling it at 1024² rather than 256² resolves detail that was
  always in the field — same seed, same ramp, same silhouette, sixteen times the
  samples. The shaded mesh picks between 95², 191², 383² and 511² planes by
  camera distance, with hysteresis, so the prologue's orbital view is not paying
  for detail it cannot show. Because displacement happens on the GPU, switching
  level is a geometry pointer swap: one mesh, one draw call, no seams and no
  skirts. The smoothing radius scales with resolution, without which a denser
  grid would come out measurably rougher rather than merely better resolved.

  The top level is capped at roughly 262k vertices. The retained 1024² height
  texture keeps the terrain signal detailed while the mesh cap leaves GPU headroom
  for the explorer controls, overlays and flythrough on presentation laptops.

  The hero reads out `ELEVATION SAMPLES`, not vertices. Those were the same
  number when the mesh was a fixed grid and are not any more.
- **Build cost is real and is paid once.** `buildDemoScene` runs the satellite
  render, the reference DEM, the least-squares fit and the validation metrics
  over the full grid: roughly 1 s of main-thread work at 1024² against 0.26 s at
  512², behind the boot sequence. Those passes deliberately are *not* decimated.
  The figures they produce are the honest part of this product, and computing
  them on a smaller copy to save load time would mean the numbers on screen no
  longer describe the surface on screen. Nothing here recurs per frame — picking
  ray-marches through bilinear sampling, whose cost is per step, not per cell.
- **Analytic normals.** Recomputed per-vertex from neighbouring texels, so
  lighting stays correct at any exaggeration.
- **CPU ray-marched picking.** Because displacement happens on the GPU, the
  geometry three.js would raycast against is a flat plane — picking against it
  would return the wrong point on any oblique view, and every slope measurement
  would be quietly wrong. `lib/raycast.ts` marches the actual height field.
- **Two variants, one implementation.** `TerrainViewer` renders `embedded`
  (in the scroll narrative, orbit only) and `full` (the `/explorer` route, with
  flythrough, measurement and layers) from the same component and the same store.

### The service layer

`src/services/api.ts` exposes `processScene`, `listScenes`, `fetchScene` and `deleteScene` as HTTP-backed operations. It decodes a preview before upload, hydrates typed arrays after retrieval, and keeps the synchronous built-in demo available for the opening animation. Rendering and interactive measurements remain in the browser.

---

## Accessibility & performance

- `prefers-reduced-motion` disables the boot timeline, camera drift, scan lines
  and scroll-scrubbed sequences, and drops the custom cursor. The space prologue
  is removed outright rather than shortened — a 320vh scroll track whose only
  purpose is to animate is not something to make a motion-sensitive visitor
  scroll through — and the page opens directly on the assembled hero.
  Functionality and all readouts are unaffected.
- Full keyboard navigation, visible focus rings, ARIA labels on every control,
  `role="slider"` with arrow-key support on the comparator divider.
- Mobile uses a 512² grid instead of 1024², a lower pixel-ratio cap, and
  on-screen flythrough controls.
- Heavy libraries are split out: `three`, `maplibre-gl`, `geotiff` and `gsap` are
  separate chunks; MapLibre loads only on demand; there is no depth model runtime.
- No WebGL: every 3D surface falls back to a 2D hillshaded canvas render of the
  same elevation data, not an apology box.

## Honest limitations

- Structure extraction runs on the demo scene, where footprints are known by
  construction. Real imagery would need a segmentation step DepthWizard does not
  perform in the browser.
- Flood extent is a bathtub fill. It ignores hydrological connectivity and flow.
  It supports rapid terrain understanding; it is not a flood model.
- Slope is computed from the DSM, so buildings register as near-vertical faces.
  Terrain-only slope needs a bare-earth model as input.
- Reprojection is implemented for the UTM families (`EPSG:326xx` / `327xx`) and
  WGS84. Other projected CRSs are reported unconverted rather than guessed at.
- DepthWizard makes no claim of operational accuracy and is not a substitute for
  surveyed elevation products.

## Attribution

The Earth imagery in the opening descent is NASA's **Blue Marble Next
Generation** (public domain), bundled at `public/textures/` and downsampled to
8192x4096 from the 21600x10800 original. The cloud layer stays at its native
2048x1024, because NASA publishes no larger combined cloud plate and resampling
it up would ship a bigger file holding the same detail. It is labelled `REFERENCE IMAGERY - NASA - BLUE MARBLE` on screen for
the whole time it is visible: it is a photograph of the world, not a DepthWizard
product, and the interface does not let it read as one.

The presentation does not fetch reference elevation. External basemaps are optional. Demo scenes and uploaded terrain are procedurally generated and labelled as simulated.
#   S I H - D E P T H W I Z A R D - T E A M - A S T R A V I E W  
 