# DepthWizard — Database and Storage Architecture

## 1. Storage Model

Separate:

1. metadata,
2. intermediate artifacts,
3. large raster files,
4. final outputs.

## 2. Logical Entities

### Project

```text
project_id
name
created_at
status
```

### Input

```text
input_id
project_id
filename
format
size
width
height
crs
resolution
checksum
```

### Job

```text
job_id
project_id
model_version
configuration
status
started_at
completed_at
error
```

### Calibration

```text
calibration_id
job_id
method
reference_source
parameters
sample_count
residual_metrics
```

### Result

```text
result_id
job_id
artifact_type
path/reference
crs
resolution
units
metadata
```

## 3. Prototype

A lightweight relational database or metadata JSON layer is sufficient for the prototype.

Large raster artifacts should not be stored directly as database blobs unless there is a specific reason.

## 4. Artifact Organization

```text
storage/
  projects/
    <project_id>/
      input/
      intermediate/
      depth/
      calibration/
      dsm/
      validation/
      visualization/
```

## 5. Reproducibility

Store the exact configuration used to generate every result.

A result should be reproducible from:

```text
Input
+ Model Version
+ Configuration
+ Reference Data
+ Calibration
= Output
```
