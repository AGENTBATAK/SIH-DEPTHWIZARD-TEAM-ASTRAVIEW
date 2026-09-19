import {
  ACCEPTED_EXTENSIONS,
  MAX_FILE_BYTES,
  processScene,
  validateFile,
  type ProcessOptions,
} from './api'

/**
 * Upload-facing boundary for the current presentation pipeline.
 *
 * This module deliberately delegates to the existing implementation. A future
 * API adapter can replace that implementation without teaching upload UI about
 * request details, previews, or the prototype backend.
 */
export const validateUpload = validateFile
export const processUpload = (file: File, options?: ProcessOptions) => processScene(file, options)

export { ACCEPTED_EXTENSIONS, MAX_FILE_BYTES }
export type { ProcessOptions }
