# DepthWizard — Validation and Accuracy

## 1. Purpose

Validation determines whether the generated elevation product is sufficiently consistent with available reference information for the intended prototype use.

## 2. Validation Flow

```text
Generated DSM
     |
     v
Align With Reference
     |
     v
Common Valid Mask
     |
     v
Sample Corresponding Pixels
     |
     v
Calculate Errors
     |
     +--> MAE
     +--> RMSE
     +--> R²
     +--> Bias / Mean Error
     |
     v
Spatial Error Map
     |
     v
Quality Report
```

## 3. Metrics

### MAE

Mean Absolute Error measures average absolute elevation difference.

### RMSE

Root Mean Squared Error penalizes larger errors more strongly.

### R²

R² describes agreement in variation between predicted and reference values. It should not be treated as a direct statement of absolute accuracy.

## 4. Additional Analysis

Where data permits, inspect errors by:

- land-cover type,
- elevation range,
- distance from image edges,
- building/non-building regions,
- shadowed areas,
- image quality,
- tile boundaries.

## 5. Validation Dataset

Prefer a held-out validation set that was not used to fit calibration parameters.

This prevents calibration and evaluation from measuring the same samples.

## 6. Uncertainty

The system may communicate uncertainty using:

- residual statistics,
- confidence/validity masks,
- spatial error maps,
- reference-data quality indicators.

Uncertainty should be shown alongside measurements rather than hidden.

## 7. Reporting

Each completed job should expose:

- model used,
- calibration method,
- reference source,
- number of valid samples,
- MAE,
- RMSE,
- R² where meaningful,
- invalid area percentage,
- processing time.

Metrics should never be fabricated when reference data is unavailable.
