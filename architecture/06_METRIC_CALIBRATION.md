# DepthWizard — Metric Calibration

## 1. Problem

Depth Anything V2 can provide relative depth. A relative value does not inherently equal meters of terrain elevation.

Metric calibration establishes a mapping from model output to a physical elevation scale.

## 2. Conceptual Transformation

A simple baseline can be represented as:

```text
Z_metric = a * D_relative + b
```

where:

- `D_relative` is model depth,
- `a` is a learned scale factor,
- `b` is an offset,
- `Z_metric` is calibrated elevation.

The actual relationship must be selected and validated from available reference/control data.

## 3. Calibration Sources

Possible sources:

- reference DEM/DSM,
- ground control points,
- known building heights,
- surveyed points,
- other trusted elevation measurements.

## 4. Calibration Workflow

```text
Relative Depth
      |
      v
Spatial Alignment
      |
      v
Extract Corresponding Reference Values
      |
      v
Fit Calibration Parameters
      |
      v
Apply Transformation
      |
      v
Metric Elevation
      |
      v
Validate
```

## 5. Quality Controls

Reject or flag calibration when:

- too few valid control points exist,
- reference coverage is insufficient,
- spatial alignment is poor,
- residual error exceeds the configured tolerance,
- the fitted transformation is unstable.

## 6. Calibration Traceability

Store:

- calibration method,
- reference dataset,
- number of control samples,
- fitted parameters,
- residual statistics,
- timestamp,
- valid region.

## 7. Important Limitation

Calibration does not automatically guarantee survey-grade accuracy. Its quality depends on the reference data, scene, model output and spatial correspondence.
