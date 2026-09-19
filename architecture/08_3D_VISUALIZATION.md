# DepthWizard — Three.js 3D Visualization

## 1. Role

Three.js/WebGL is the final visualization layer.

It receives elevation data produced by the scientific pipeline and turns it into an interactive terrain surface.

## 2. Rendering Pipeline

```text
Validated DSM
     |
     v
Visualization Tile / Height Grid
     |
     v
Vertex Grid
     |
     v
Elevation → Vertex Height
     |
     v
Terrain Mesh
     |
     +---- Texture / Map Context
     |
     v
Three.js Scene
     |
     +--> Camera Controls
     +--> Lighting
     +--> Interaction
     +--> Flythrough
     +--> Measurement UI
```

## 3. Terrain Mesh

For each grid cell:

- geographic position determines horizontal location,
- elevation determines vertex height,
- neighboring cells form triangles.

The mesh should preserve the spatial aspect ratio of the source raster.

## 4. Coordinate Handling

Browser rendering uses a local scene coordinate system for numerical stability.

A common approach is:

```text
World X = Easting - OriginEasting
World Z = -(Northing - OriginNorthing)
World Y = Elevation - ReferenceElevation
```

The exact convention is implementation-specific but must remain consistent.

## 5. Visualization Features

The prototype should support:

- orbit/rotate,
- pan,
- zoom,
- reset camera,
- terrain flythrough,
- elevation inspection,
- height readout,
- optional slope visualization,
- optional wireframe,
- map/texture context,
- loading/progress state.

## 6. Performance

Use:

- geometry simplification where necessary,
- tiled loading,
- GPU-friendly buffers,
- frustum culling,
- level-of-detail where required,
- efficient disposal of unused WebGL resources.

The renderer should never freeze the UI while processing large terrain datasets.

## 7. Scientific Integrity

The 3D scene is a visualization of the DSM.

It must not silently invent elevation values or modify the source DSM in a way that changes reported measurements.
