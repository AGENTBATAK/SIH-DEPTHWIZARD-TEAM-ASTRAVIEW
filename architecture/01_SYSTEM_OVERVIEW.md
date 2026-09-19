# DepthWizard — System Overview

## 1. Purpose

DepthWizard is an AI + GIS pipeline for converting overhead imagery into a georeferenced, metrically calibrated Digital Surface Model (DSM) and an interactive 3D terrain representation.

The system is designed around a critical distinction:

- **Depth Anything V2 provides relative depth**, not guaranteed absolute geographic elevation.
- **GIS/reference data and calibration convert relative depth into metric elevation**.
- **The DSM is the authoritative elevation product**.
- **Three.js is the visualization layer**, consuming the DSM rather than replacing the geospatial processing pipeline.

## 2. Primary Objective

Given suitable overhead imagery, the system should:

1. Validate and preprocess the input.
2. Preserve or recover geographic reference information where available.
3. Run Depth Anything V2 inference.
4. Adapt the inference workflow for the target 75° top-down domain.
5. Produce a relative depth map.
6. Calibrate relative depth against metric reference information.
7. Generate a georeferenced DSM.
8. Quantify output quality and uncertainty.
9. Render the resulting elevation surface interactively in 3D.
10. Provide downloadable and inspectable outputs.

## 3. High-Level Pipeline

```text
User Input
   |
   v
Input Validation
   |
   v
Image / Metadata Preprocessing
   |
   +----------------------+
   |                      |
   v                      v
RGB Processing       GIS Processing
   |                      |
   v                      v
Depth Anything V2     CRS / Reference Data
   |                      |
   v                      |
Relative Depth            |
   |                      |
   +----------+-----------+
              |
              v
       Metric Calibration
              |
              v
        Elevation Raster
              |
              v
         DSM Generation
              |
       +------+------+
       |             |
       v             v
 Validation      GeoTIFF/DSM
       |             |
       +------+------+
              |
              v
       Three.js Renderer
              |
              v
      Interactive 3D Output
```

## 4. Core Design Principles

### Separation of concerns

The frontend, API, ML inference, GIS processing, calibration, DSM generation, validation, and visualization layers should remain independently testable.

### Metric correctness

No relative-depth output should be presented as real-world elevation without an explicit calibration/reference stage.

### Geospatial integrity

CRS, spatial resolution, geographic extent, raster transform, alignment, and nodata values must be preserved through the GIS pipeline.

### Traceability

Every generated DSM should be traceable to:

- source image,
- preprocessing configuration,
- model/version,
- calibration method,
- reference dataset,
- processing parameters,
- validation metrics.

### Graceful degradation

If required metadata or calibration references are unavailable, the system should clearly identify the limitation instead of silently presenting unsupported metric claims.

## 5. Main Components

| Component | Responsibility |
|---|---|
| Web UI | Upload, processing status, visualization and result interaction |
| Backend API | Orchestration, validation and job management |
| Preprocessing | Image normalization, tiling and quality checks |
| Depth Inference | Depth Anything V2 inference |
| Domain Adaptation | Configuration/fine-tuning workflow for target imagery |
| GIS Engine | CRS, reprojection, clipping, alignment and raster operations |
| Calibration Engine | Relative-to-metric elevation transformation |
| DSM Engine | Surface generation and post-processing |
| Validation Engine | Accuracy and quality assessment |
| Storage | Inputs, intermediate products, metadata and outputs |
| Three.js Renderer | Interactive 3D surface visualization |

## 6. Outputs

Primary outputs:

- Relative depth map
- Metric elevation raster
- DSM
- GeoTIFF DSM where georeferencing is available
- Validation report
- Error/uncertainty layer where supported
- Interactive 3D terrain view

## 7. Non-Goals

The prototype should not claim:

- universal centimeter-level accuracy,
- absolute elevation from RGB alone,
- that generic Depth Anything V2 is inherently a metric depth estimator,
- survey-grade output without appropriate reference/control data.

Accuracy is dependent on image quality, viewing geometry, scene characteristics, reference data, calibration and model behavior.
