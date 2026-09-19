// Compatibility entry point. The lightweight presentation backend lives in
// `prototype/` so it can later be replaced without disturbing the frontend.
export { createApp } from './prototype/server.mjs'

import { createApp } from './prototype/server.mjs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = await createApp()
  server.listen(Number(process.env.PORT || 3001), '127.0.0.1', () => console.log(`DepthWizard prototype: http://127.0.0.1:${server.address().port}`))
}
