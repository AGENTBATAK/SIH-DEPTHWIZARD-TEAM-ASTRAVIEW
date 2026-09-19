# DepthWizard — GIS Pipeline

## 1. Purpose

The GIS layer provides spatial reference, coordinate consistency and raster interoperability.

## 2. Pipeline

```text
Source Raster
     |
     v
Read Geospatial Metadata
     |
     v
CRS Detection
     |
     +---- Missing CRS ----> Explicitly request/select reference CRS
     |
     v
CRS Normalization
     |
     v
Reprojection
     |
     v
Resolution / Pixel Alignment
     |
     v
Spatial Clipping
     |
     v
Reference DEM/DSM Alignment
     |
     v
Calibration
     |
     v
Geo-referenced DSM
```

## 3. CRS

The system should:

1. read the source CRS when present,
2. validate the CRS,
3. choose a common working CRS,
4. reproject datasets into that CRS,
5. preserve the original CRS metadata for traceability.

For distance/area/elevation processing, an appropriate projected CRS should be preferred where required by the operation.

## 4. Raster Alignment

Reference and predicted rasters must agree on:

- CRS,
- pixel dimensions,
- affine transform,
- spatial extent,
- pixel-center convention,
- resolution.

Resampling method should be selected according to the data type and operation.

## 5. Nodata Handling

Nodata values must never be silently interpreted as valid elevation.

Maintain an explicit valid-data mask through:

- preprocessing,
- calibration,
- DSM generation,
- validation,
- export.

## 6. Reference Data

Possible references include:

- DEM,
- DSM,
- known elevation points,
- GCPs,
- surveyed heights.

Reference quality and resolution should be recorded because they influence validation quality.

## 7. GIS Outputs

Recommended outputs:

- GeoTIFF DSM,
- aligned reference raster,
- valid-data mask,
- error raster,
- metadata JSON,
- optional contour/profile products.
