# DepthWizard — Security and Performance

## 1. Security

### Upload Security

- allow only supported formats,
- validate MIME type and file signature,
- enforce size limits,
- sanitize filenames,
- isolate files by project/job,
- never execute uploaded content.

### API Security

- validate all request fields,
- authenticate protected deployments,
- enforce authorization per project,
- rate-limit expensive endpoints where required.

### Data Privacy

Uploaded imagery and generated artifacts should remain scoped to the project unless explicitly shared.

## 2. GPU Performance

Depth inference is the primary GPU-intensive stage.

Optimize through:

- CUDA acceleration,
- mixed precision where numerically acceptable,
- batching,
- tiled inference,
- model reuse,
- memory cleanup.

## 3. Raster Performance

Use:

- tiled processing,
- efficient raster formats,
- windowed reads,
- windowed writes,
- lazy loading where practical.

## 4. Browser Performance

Three.js should use:

- BufferGeometry,
- typed arrays,
- efficient texture formats,
- LOD,
- progressive loading,
- controlled mesh resolution.

## 5. UX Performance

The UI should always show:

- current stage,
- progress,
- elapsed/estimated processing state where meaningful,
- failure status,
- completed artifacts.

The browser must remain responsive while processing occurs on the backend.

## 6. Scaling Path

Prototype:

```text
Single GPU Machine
 ├── Frontend
 ├── API
 ├── Worker
 ├── ML
 └── GIS
```

Future:

```text
Frontend
   |
API
   |
Queue
   +--> ML Workers
   +--> GIS Workers
   +--> DSM Workers
   |
Object Storage
   |
Metadata DB
```
