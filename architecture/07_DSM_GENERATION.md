# DepthWizard — DSM Generation

## 1. Definition

A Digital Surface Model represents the elevation of visible surfaces such as:

- ground,
- buildings,
- vegetation,
- structures.

The system must distinguish DSM generation from bare-earth DEM generation.

## 2. Pipeline

```text
Metric Elevation
      |
      v
Valid-data Mask
      |
      v
Spatial Consistency Check
      |
      v
Noise / Outlier Filtering
      |
      v
Gap Handling
      |
      v
Optional Smoothing
      |
      v
DSM Raster
      |
      v
GeoTIFF + Metadata
```

## 3. Filtering

Filtering should remove obvious:

- isolated spikes,
- invalid pixels,
- tile-boundary artifacts,
- extreme outliers.

Filtering must preserve meaningful structures and should be evaluated so that buildings and other elevated objects are not incorrectly flattened.

## 4. Smoothing

Smoothing is optional and must be controlled.

Over-smoothing can remove legitimate elevation discontinuities.

## 5. DSM Metadata

Each DSM should contain:

- CRS,
- transform,
- width/height,
- resolution,
- bounds,
- units,
- nodata,
- source job ID,
- calibration ID,
- model ID.

## 6. Export

Primary export:

- Cloud/standard GeoTIFF where spatial metadata is available.

Additional prototype output:

- compact height-grid representation for Three.js rendering.

## 7. Visualization Preparation

For browser rendering, the DSM may be:

- downsampled,
- tiled,
- converted to a compact binary representation,
- normalized only for rendering.

Rendering normalization must not overwrite the authoritative metric DSM.
