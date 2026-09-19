# DepthWizard — Model Optimization and Domain Adaptation

## 1. Objective

Optimize the depth pipeline for overhead imagery captured around the target 75° viewing geometry while preserving generalization and measurable accuracy.

## 2. Optimization Hierarchy

```text
Baseline Model
      |
      v
Input / Resolution Tuning
      |
      v
Inference Configuration
      |
      v
Domain-Specific Evaluation
      |
      v
Optional Fine-Tuning
      |
      v
Held-Out Validation
```

## 3. Parameters to Investigate

Depending on the Depth Anything V2 implementation:

- input resolution,
- tile size,
- overlap,
- inference batch size,
- preprocessing normalization,
- model variant,
- post-processing configuration.

Only parameters supported by the selected implementation should be changed.

## 4. Fine-Tuning

If labeled/reference data is available:

1. construct representative training data,
2. separate training/validation/test scenes,
3. avoid spatial leakage,
4. train using the appropriate objective,
5. compare against the frozen baseline,
6. validate on unseen scenes.

## 5. Hyperparameter Experiments

Track:

```text
Experiment ID
Model Variant
Input Resolution
Preprocessing
Training Configuration
Dataset Version
Validation Metrics
Runtime
GPU Memory
```

## 6. Acceptance Criteria

A change should be adopted only if it demonstrates a meaningful improvement on held-out data without unacceptable:

- runtime increase,
- memory increase,
- spatial artifacts,
- generalization loss.

## 7. Important Claim Boundary

The project should describe model tuning as an engineering/experimental process unless the exact training procedure and evidence are documented.
