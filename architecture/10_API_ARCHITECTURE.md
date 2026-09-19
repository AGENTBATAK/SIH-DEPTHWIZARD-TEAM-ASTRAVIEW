# DepthWizard — API Architecture

## 1. API Responsibilities

The backend API should provide:

- project management,
- upload management,
- processing-job creation,
- status monitoring,
- result retrieval,
- validation metrics,
- artifact downloads.

## 2. Suggested Endpoints

```text
POST   /api/projects
GET    /api/projects/{project_id}

POST   /api/projects/{project_id}/inputs
POST   /api/projects/{project_id}/process
GET    /api/jobs/{job_id}
GET    /api/jobs/{job_id}/status

GET    /api/projects/{project_id}/results
GET    /api/projects/{project_id}/validation
GET    /api/projects/{project_id}/artifacts/{artifact_id}
```

## 3. Job Status

Example:

```json
{
  "job_id": "job_123",
  "status": "DSM_GENERATION",
  "progress": 72,
  "stage": "Generating calibrated DSM",
  "error": null
}
```

## 4. Result Contract

A result should identify:

- project ID,
- job ID,
- source input,
- DSM artifact,
- CRS,
- resolution,
- units,
- validation metrics,
- visualization artifact,
- processing metadata.

## 5. Error Contract

Example:

```json
{
  "error_code": "REFERENCE_ALIGNMENT_FAILED",
  "message": "Reference raster could not be aligned with the prediction.",
  "stage": "GIS_PROCESSING",
  "recoverable": true
}
```

## 6. Security

For the prototype:

- validate file type,
- enforce file-size limits,
- sanitize filenames,
- isolate uploaded files,
- reject unsupported content,
- avoid exposing internal filesystem paths.

## 7. Asynchronous Processing

Heavy processing should run as a background job rather than blocking the HTTP request.

The frontend should poll or subscribe to job status.
