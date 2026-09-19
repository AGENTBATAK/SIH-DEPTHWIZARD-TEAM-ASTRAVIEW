# DepthWizard — Deployment Architecture

## 1. Prototype Deployment

The recommended SIH prototype can run on a GPU-enabled workstation/server.

```text
Browser
   |
   v
Frontend
   |
   v
Backend API
   |
   v
Processing Worker
   |
   +--> Depth Anything V2 / GPU
   +--> GIS Engine
   +--> Calibration
   +--> DSM
   |
   v
Artifact Storage
```

## 2. Containerization

Recommended services:

```text
frontend
backend
worker
```

The worker image should contain the ML/GIS dependencies and GPU runtime requirements.

## 3. GPU Runtime

The deployment must verify:

- GPU visibility,
- compatible CUDA/runtime stack,
- model loading,
- sufficient VRAM,
- fallback behavior.

## 4. Configuration

Do not hard-code:

- model paths,
- storage paths,
- API URLs,
- CRS,
- calibration thresholds,
- tile sizes.

Use environment/configuration files.

## 5. Health Checks

Backend health:

```text
GET /health
```

Worker readiness should verify:

- model availability,
- GPU availability if required,
- storage accessibility.

## 6. Production Scaling Path

For larger workloads:

```text
Load Balancer
      |
API Instances
      |
Job Queue
  |       |
ML GPU   GIS/CPU
Workers  Workers
  |       |
  +---+---+
      |
Object Storage
      |
Metadata Database
```
