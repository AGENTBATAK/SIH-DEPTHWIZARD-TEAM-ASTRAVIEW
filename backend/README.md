# DepthWizard prototype backend

This is a deliberately small Node HTTP backend for the SIH presentation. It has
no database, authentication, cloud service, GIS engine, or AI inference runtime.

It validates a browser-created image preview, atomically saves a local scene JSON
record, and deterministically creates clearly labelled synthetic terrain. Replace
`buildScene` with a real processing adapter later without changing the frontend
scene contract.

## Endpoints

- `POST /api/upload` - validate and persist a synthetic scene
- `POST /api/process` - upload-compatible processing alias
- `POST /api/demo` - deterministic presentation demo terrain
- `GET /api/scenes`, `GET /api/scenes/:id`, `DELETE /api/scenes/:id` - local scene library

The legacy `POST /api/scenes` and synthetic-workflow endpoints remain available
for the existing presentation UI.
