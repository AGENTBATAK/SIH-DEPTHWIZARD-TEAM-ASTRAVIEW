import { spawn } from 'node:child_process'
import { createConnection } from 'node:net'

const listeningAt = (host, port) => new Promise(resolve => {
  const socket = createConnection({ host, port })
  socket.once('connect', () => { socket.destroy(); resolve(true) })
  socket.once('error', () => resolve(false))
})
const listening = async port => (await Promise.all(['127.0.0.1', '::1'].map(host => listeningAt(host, port)))).some(Boolean)

const [apiRunning, frontendRunning] = await Promise.all([listening(3001), listening(5173)])
if (apiRunning && frontendRunning) {
  console.log('DepthWizard is already running at http://localhost:5173')
  process.exit(0)
}
if (apiRunning || frontendRunning) {
  const occupied = [apiRunning && 'API port 3001', frontendRunning && 'frontend port 5173'].filter(Boolean).join(' and ')
  console.error(`${occupied} is already in use. Stop the partial DepthWizard process, then run npm run dev again.`)
  process.exit(1)
}

const children = [
  spawn(process.execPath, ['--watch', 'backend/api/index.mjs'], { stdio: 'inherit', env: { ...process.env, PORT: '3001' } }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', '5173', '--strictPort', ...process.argv.slice(2)], { stdio: 'inherit' }),
]
let stopping = false
function stop(code = 0) {
  if (stopping) return
  stopping = true
  for (const child of children) child.kill()
  process.exitCode = code
}
for (const child of children) {
  child.on('error', error => { console.error(error); stop(1) })
  child.on('exit', code => stop(code ?? 0))
}
process.on('SIGINT', () => stop())
process.on('SIGTERM', () => stop())
