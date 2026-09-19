# DepthWizard — Repository Structure

```text
SIH-DEPTHWIZARD/
│
├── architecture/
│   ├── 01_SYSTEM_OVERVIEW.md
│   ├── 02_SYSTEM_ARCHITECTURE.md
│   ├── 03_DATA_FLOW.md
│   ├── 04_ML_DEPTH_PIPELINE.md
│   ├── 05_GIS_PIPELINE.md
│   ├── 06_METRIC_CALIBRATION.md
│   ├── 07_DSM_GENERATION.md
│   ├── 08_3D_VISUALIZATION.md
│   ├── 09_VALIDATION_AND_ACCURACY.md
│   ├── 10_API_ARCHITECTURE.md
│   ├── 11_DATABASE_STORAGE.md
│   ├── 12_ERROR_HANDLING.md
│   ├── 13_SECURITY_AND_PERFORMANCE.md
│   ├── 14_MODEL_OPTIMIZATION.md
│   ├── 15_DEPLOYMENT.md
│   ├── 16_FOLDER_STRUCTURE.md
│   ├── 17_JUDGE_QA.md
│   └── diagrams/
│
├── frontend/
│   ├── src/
│   ├── components/
│   ├── pages/
│   ├── services/
│   └── three/
│
├── backend/
│   ├── api/
│   ├── services/
│   ├── workers/
│   ├── models/
│   └── utils/
│
├── ml/
│   ├── depth_anything_v2/
│   ├── preprocessing/
│   ├── inference/
│   ├── calibration/
│   └── evaluation/
│
├── gis/
│   ├── georeferencing/
│   ├── reprojection/
│   ├── alignment/
│   ├── resampling/
│   └── raster_processing/
│
├── dsm/
│   ├── generation/
│   ├── filtering/
│   ├── validation/
│   └── export/
│
├── data/
│   ├── input/
│   ├── intermediate/
│   ├── reference/
│   └── output/
│
├── evaluation/
│   ├── datasets/
│   ├── metrics/
│   └── reports/
│
├── deployment/
│   ├── docker/
│   └── configs/
│
├── tests/
└── README.md
```

## Dependency Direction

```text
Frontend
   ↓
API
   ↓
Pipeline Orchestration
   ↓
ML / GIS / Calibration / DSM
   ↓
Artifacts

Three.js reads visualization-ready artifacts.
```

The ML and GIS modules should remain independently testable and should not depend on the React UI.
