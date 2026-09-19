# DepthWizard — Error Handling

## 1. Principle

Errors should be explicit, stage-specific and actionable.

The system must fail safely rather than return a visually attractive but scientifically invalid result.

## 2. Error Categories

### Input errors

- unsupported file format,
- corrupted file,
- insufficient resolution,
- invalid dimensions,
- missing required data.

### GIS errors

- missing/invalid CRS,
- incompatible projection,
- alignment failure,
- invalid transform,
- reference coverage mismatch.

### ML errors

- model loading failure,
- GPU memory exhaustion,
- invalid tensor dimensions,
- inference timeout.

### Calibration errors

- insufficient control points,
- unstable fit,
- excessive residuals,
- missing reference.

### DSM errors

- excessive nodata,
- invalid values,
- tile seam artifacts,
- export failure.

### Visualization errors

- unsupported payload,
- excessive mesh size,
- WebGL initialization failure.

## 3. Recovery

Recoverable failures should offer:

- retry,
- smaller tiles,
- lower visualization resolution,
- alternative reference,
- corrected CRS,
- reduced batch size.

Non-recoverable failures should stop the pipeline and explain the cause.

## 4. GPU Memory

If inference exceeds GPU memory:

```text
Large Image
   |
   v
Reduce Tile Size
   |
   v
Reduce Batch Size
   |
   v
Retry
```

The system should preserve output consistency across tile sizes.

## 5. Logging

Every job should record:

- stage,
- timestamp,
- severity,
- error code,
- message,
- job/project ID.

Avoid exposing internal stack traces to end users.
