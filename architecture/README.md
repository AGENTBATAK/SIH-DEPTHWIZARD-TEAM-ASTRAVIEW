# DepthWizard Architecture

This directory contains the high-level technical architecture for the SIH DepthWizard project.

## Recommended Reading Order

1. `01_SYSTEM_OVERVIEW.md`
2. `02_SYSTEM_ARCHITECTURE.md`
3. `03_DATA_FLOW.md`
4. `04_ML_DEPTH_PIPELINE.md`
5. `05_GIS_PIPELINE.md`
6. `06_METRIC_CALIBRATION.md`
7. `07_DSM_GENERATION.md`
8. `08_3D_VISUALIZATION.md`
9. `09_VALIDATION_AND_ACCURACY.md`
10. `10_API_ARCHITECTURE.md`
11. `11_DATABASE_STORAGE.md`
12. `12_ERROR_HANDLING.md`
13. `13_SECURITY_AND_PERFORMANCE.md`
14. `14_MODEL_OPTIMIZATION.md`
15. `15_DEPLOYMENT.md`
16. `16_FOLDER_STRUCTURE.md`
17. `17_JUDGE_QA.md`

## Core Technical Story

```text
Overhead RGB Image
        ↓
Preprocessing + GIS Normalization
        ↓
Depth Anything V2
        ↓
Relative Depth
        ↓
Metric Calibration
        ↓
DSM Generation
        ↓
Validation
        ↓
Three.js / WebGL
        ↓
Interactive 3D Terrain + Flythrough
```

## Architecture Rule

Never present relative model depth as absolute elevation without a documented calibration/reference stage.
