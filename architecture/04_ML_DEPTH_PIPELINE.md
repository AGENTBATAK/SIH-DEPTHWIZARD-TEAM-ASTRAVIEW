# DepthWizard — ML Depth Pipeline

## 1. Model Role

Depth Anything V2 is the depth-estimation component.

Its output must be treated as a **relative depth representation unless a validated metric-depth configuration is explicitly established**.

## 2. ML Pipeline

```text
RGB Image
   |
   v
Quality Check
   |
   v
Orientation / Crop Normalization
   |
   v
Resize / Tile
   |
   v
Depth Anything V2
   |
   v
Relative Depth
   |
   v
Post-processing
   |
   v
Calibration Input
```

## 3. 75° Top-Down Domain

The target imagery differs from conventional datasets because the camera is oriented approximately 75° toward the scene.

The system should therefore evaluate:

- viewing-angle distribution,
- object scale,
- image resolution,
- ground sampling distance,
- shadows,
- roofs and elevated structures,
- vegetation,
- texture sparsity,
- occlusion,
- seasonal differences.

The model should not be assumed to generalize optimally to this domain without validation.

## 4. Adaptation Strategy

The architecture supports three levels:

### Level 1 — Inference-only baseline

Use pretrained Depth Anything V2 and establish a baseline.

### Level 2 — Hyperparameter/domain configuration

Tune inference settings and preprocessing for the target imagery.

### Level 3 — Domain adaptation/fine-tuning

Where suitable labeled/reference data exists, fine-tune or adapt the model using representative top-down imagery.

The project should report which level was actually used. It should not claim fine-tuning if only inference configuration was performed.

## 5. Preprocessing

Potential operations:

- RGB conversion,
- normalization,
- controlled resizing,
- tiling,
- overlap handling,
- invalid-pixel masking.

Preprocessing parameters must be recorded with every run.

## 6. Post-processing

Potential operations:

- normalization,
- denoising,
- invalid-region masking,
- edge artifact handling,
- tile blending.

Post-processing must not distort the spatial relationship required for calibration.

## 7. Model Evaluation

Evaluate against available reference elevation using:

- MAE,
- RMSE,
- R²,
- error distribution,
- spatial error maps.

Evaluation should be performed on held-out scenes where possible.
