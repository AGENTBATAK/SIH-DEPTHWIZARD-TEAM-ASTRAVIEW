# DepthWizard — System Architecture

## 1. Architecture

```text
                         +----------------------+
                         |      User / Judge    |
                         +----------+-----------+
                                    |
                                    v
                         +----------------------+
                         |    React Frontend    |
                         | Upload / Dashboard   |
                         | Map / 3D / Results   |
                         +----------+-----------+
                                    |
                              HTTPS / WS
                                    |
                                    v
                         +----------------------+
                         |      Backend API     |
                         |   FastAPI Service    |
                         +----------+-----------+
                                    |
             +----------------------+----------------------+
             |                      |                      |
             v                      v                      v
      +-------------+       +-------------+       +-------------+
      | Preprocess  |       | GIS Engine  |       | Job/State  |
      +------+------+       +------+------+       +-------------+
             |                      |
             v                      v
      +-------------+       +-------------+
      | Depth       |       | Reference   |
      | Anything V2 |       | DEM/GCP/GIS |
      +------+------+       +------+------+
             |                      |
             +----------+-----------+
                        |
                        v
                +---------------+
                | Calibration   |
                +-------+-------+
                        |
                        v
                +---------------+
                | DSM Generator |
                +-------+-------+
                        |
                +-------+-------+
                |               |
                v               v
        +---------------+ +-------------+
        | Validation    | | Geo Outputs |
        +-------+-------+ +-------------+
                |
                +---------------+
                        |
                        v
                +---------------+
                | Three.js/WebGL|
                | 3D Renderer   |
                +---------------+
```

## 2. Architectural Layers

### Presentation Layer

React-based UI responsible for:

- upload,
- project creation,
- processing state,
- progress display,
- 2D/map result inspection,
- 3D visualization,
- metric display,
- download controls.

### API / Orchestration Layer

Responsible for:

- request validation,
- project/job creation,
- pipeline orchestration,
- status reporting,
- output discovery,
- error reporting.

### Processing Layer

Contains independent services for:

- image preprocessing,
- model inference,
- GIS processing,
- calibration,
- DSM construction,
- validation.

### Data Layer

Stores:

- source inputs,
- metadata,
- intermediate rasters,
- model outputs,
- calibration artifacts,
- final DSM,
- validation results.

### Visualization Layer

Three.js/WebGL converts the final elevation grid into an interactive terrain mesh.

## 3. Processing Job State Machine

```text
CREATED
  |
  v
VALIDATING
  |
  v
PREPROCESSING
  |
  v
DEPTH_INFERENCE
  |
  v
GIS_PROCESSING
  |
  v
CALIBRATING
  |
  v
DSM_GENERATION
  |
  v
VALIDATING_OUTPUT
  |
  v
COMPLETED

Any stage --> FAILED
```

## 4. Component Boundaries

The frontend must not perform heavy ML or GIS computation.

The backend should orchestrate processing but keep specialized operations inside dedicated services/modules.

The ML service should expose model inference as a deterministic processing unit.

The GIS layer should own CRS and raster transformations.

The calibration layer should own scale/shift or other explicitly selected metric transformation logic.

The DSM layer should own construction and raster post-processing.

The renderer should consume normalized output data and should not silently alter scientific elevation values.

## 5. Prototype Deployment

For the SIH prototype, these components may run on one GPU-enabled machine while remaining logically separated.

A production deployment can later split:

- API,
- worker,
- model inference,
- GIS processing,
- object storage,
- database,
- frontend.
