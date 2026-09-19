# DepthWizard — End-to-End Data Flow

## 1. Input

Supported prototype inputs may include:

- PNG/JPEG RGB imagery
- GeoTIFF imagery
- reference DEM/DSM data where available
- calibration/control information such as known heights or GCPs

## 2. Data Flow

```text
Input File
   |
   v
File Validation
   |
   +--> Format Check
   +--> Resolution Check
   +--> Corruption Check
   +--> Metadata Check
   |
   v
Preprocessing
   |
   +--> Resize / Tile
   +--> Normalize
   +--> Preserve Spatial Metadata
   |
   v
Depth Anything V2
   |
   v
Relative Depth Raster
   |
   +--------------------+
   |                    |
   v                    v
Reference DEM      GCP / Known Heights
   |                    |
   +----------+---------+
              v
        Calibration
              |
              v
      Metric Elevation
              |
              v
      Spatial Alignment
              |
              v
         DSM Creation
              |
       +------+------+
       |             |
       v             v
   Validation     GeoTIFF
       |
       v
  Quality Metrics
       |
       v
  Three.js Payload
       |
       v
 Interactive 3D
```

## 3. Data Contracts

### Image metadata

At minimum, retain:

- filename,
- format,
- width,
- height,
- number of channels,
- bit depth,
- CRS if available,
- affine transform if available,
- ground sampling distance if available,
- nodata value if applicable.

### Depth output

Store:

- width,
- height,
- depth values,
- model identifier,
- model version,
- preprocessing configuration,
- inference timestamp.

### Calibrated elevation

Store:

- elevation values,
- units,
- calibration method,
- scale/shift parameters or model parameters,
- reference source,
- valid-data mask.

### DSM

Store:

- elevation raster,
- CRS,
- transform,
- resolution,
- extent,
- nodata,
- creation metadata.

## 4. Data Integrity

Every intermediate artifact should have:

- deterministic project/job identifier,
- processing stage,
- source reference,
- configuration,
- timestamp,
- checksum where practical.

## 5. Large Images

Large imagery should be processed using tiles/chunks.

A tiled pipeline should:

1. divide the source into overlapping windows,
2. run inference per tile,
3. remove unreliable tile borders where required,
4. blend overlapping predictions,
5. reconstruct a continuous raster,
6. preserve geographic alignment.

The overlap/blending strategy must be consistent across runs.
