import { createHash } from 'node:crypto'
import { chromium } from 'playwright-core'
import { existsSync } from 'node:fs'

const baseUrl = process.argv[2] ?? 'http://localhost:5173'
const denyPointerLock = process.argv.includes('--deny-pointer-lock')
const executablePath = process.env.BROWSER_PATH || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(existsSync)

const browser = await chromium.launch({
  executablePath,
  args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
if (denyPointerLock) {
  await page.addInitScript(() => {
    HTMLElement.prototype.requestPointerLock = () => Promise.resolve()
  })
}
const errors = []
page.on('console', message => {
  if (message.type() === 'error') errors.push(`${message.text()} ${message.location().url}`.trim())
})
page.on('pageerror', error => errors.push(error.message))

await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 45000 })
await page.waitForFunction(() => !document.body.innerText.includes('INITIALIZING'), { timeout: 60000 })
await page.locator('#upload').scrollIntoViewIfNeeded()
await page.getByRole('button', { name: 'Run Demo Pipeline' }).click()
await page.waitForURL('**/explorer', { timeout: 60000 })
await page.getByText('GRID RESOLUTION').waitFor({ timeout: 15000 })

const canvas = page.locator('canvas[data-engine^="three.js"]')
await canvas.waitFor({ state: 'visible', timeout: 15000 })
const box = await canvas.boundingBox()
if (!box) throw new Error('Explorer canvas has no bounding box.')

const storeState = () => page.evaluate(async () => {
  const moduleUrl = performance.getEntriesByType('resource')
    .map(entry => entry.name)
    .find(url => url.includes('/src/hooks/useScene.ts'))
  if (!moduleUrl) throw new Error('Live scene-store module URL was not found.')
  const { useSceneStore } = await import(moduleUrl)
  const state = useSceneStore.getState()
  return {
    seed: state.scene?.terrain.seed ?? null,
    size: state.scene?.terrain.size ?? null,
    samples: state.scene?.terrain.heights.length ?? null,
    structures: state.scene?.terrain.structures.length ?? 0,
    measurements: state.measurements.length,
    pendingPoint: Boolean(state.pendingPoint),
    selectedStructure: state.selectedStructure?.id ?? null,
    cameraMode: state.cameraMode,
  }
})
const canonicalState = await storeState()

const digest = async () => createHash('sha256').update(await canvas.screenshot()).digest('hex')
const cx = box.x + box.width * 0.5
const cy = box.y + box.height * 0.48

const initialDigest = await digest()
await page.mouse.move(cx, cy)
await page.mouse.down({ button: 'left' })
await page.mouse.move(cx + 120, cy - 40, { steps: 12 })
await page.mouse.up({ button: 'left' })
await page.waitForTimeout(350)
const orbitDigest = await digest()

await page.mouse.move(cx, cy)
await page.mouse.wheel(0, -420)
await page.waitForTimeout(350)
const zoomDigest = await digest()

await page.mouse.move(cx, cy)
await page.mouse.down({ button: 'right' })
await page.mouse.move(cx + 70, cy + 40, { steps: 10 })
await page.mouse.up({ button: 'right' })
await page.waitForTimeout(350)
const panDigest = await digest()

await page.getByRole('button', { name: 'Reset' }).click()
await page.getByText('RETURNING TO ORBIT').waitFor({ timeout: 3000 })
await page.getByText('RETURNING TO ORBIT').waitFor({ state: 'hidden', timeout: 8000 })

await page.getByRole('button', { name: 'Measure' }).click()
const measureCandidates = [
  [0.38, 0.44], [0.47, 0.52], [0.58, 0.46], [0.63, 0.58], [0.32, 0.58],
]
for (const [x, y] of measureCandidates) {
  await page.mouse.click(box.x + box.width * x, box.y + box.height * y)
  await page.waitForTimeout(120)
  if ((await storeState()).measurements > 0) break
}
const measuredState = await storeState()

await page.getByRole('button', { name: 'Inspect' }).click()
const projectedStructures = await page.evaluate(async ({ width, height }) => {
  const moduleUrl = performance.getEntriesByType('resource')
    .map(entry => entry.name)
    .find(url => url.includes('/src/hooks/useScene.ts'))
  if (!moduleUrl) throw new Error('Live scene-store module URL was not found.')
  const { useSceneStore } = await import(moduleUrl)
  const state = useSceneStore.getState()
  const terrain = state.scene?.terrain
  if (!terrain) return []
  const camera = { x: 0.5, y: 0.56, z: 0.66 }
  const target = { x: 0, y: 0.03, z: 0 }
  const normalise = vector => {
    const length = Math.hypot(vector.x, vector.y, vector.z)
    return { x: vector.x / length, y: vector.y / length, z: vector.z / length }
  }
  const cross = (a, b) => ({
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  })
  const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z
  const forward = normalise({ x: target.x - camera.x, y: target.y - camera.y, z: target.z - camera.z })
  const right = normalise(cross(forward, { x: 0, y: 1, z: 0 }))
  const up = cross(right, forward)
  const tan = Math.tan((42 * Math.PI / 180) / 2)
  const aspect = width / height
  return terrain.structures.map(structure => {
    const point = {
      x: structure.u - 0.5,
      y: ((structure.topElevation.value - terrain.minElevation) / terrain.extentMeters) * state.exaggeration,
      z: 0.5 - structure.v,
    }
    const relative = { x: point.x - camera.x, y: point.y - camera.y, z: point.z - camera.z }
    const depth = dot(relative, forward)
    const ndcX = dot(relative, right) / (depth * tan * aspect)
    const ndcY = dot(relative, up) / (depth * tan)
    return {
      id: structure.id,
      x: ((ndcX + 1) / 2) * width,
      y: ((1 - ndcY) / 2) * height,
      depth,
    }
  }).filter(point => point.depth > 0 && point.x > 40 && point.x < width - 300 && point.y > 70 && point.y < height - 100)
}, { width: box.width, height: box.height })

for (const point of projectedStructures) {
  await page.mouse.click(box.x + point.x, box.y + point.y)
  await page.waitForTimeout(180)
  if ((await storeState()).selectedStructure) break
}
const inspectedState = await storeState()

await page.getByRole('button', { name: 'Enter flythrough' }).click()
await page.getByRole('button', { name: 'EXIT · ESC' }).waitFor({ timeout: 12000 })
await page.waitForFunction(async () => {
  const moduleUrl = performance.getEntriesByType('resource')
    .map(entry => entry.name)
    .find(url => url.includes('/src/hooks/useScene.ts'))
  if (!moduleUrl) return false
  const { useSceneStore } = await import(moduleUrl)
  return useSceneStore.getState().cameraMode === 'flythrough'
}, undefined, { timeout: 12000 })
const flyingState = await storeState()
const headingPanel = page.getByText('HEADING', { exact: true }).locator('..')
const headingBeforeMouseLook = await headingPanel.innerText()
await page.mouse.click(cx, cy)
if (!denyPointerLock) {
  await page.waitForFunction(() => Boolean(document.pointerLockElement), undefined, { timeout: 5000 })
} else {
  await page.waitForTimeout(100)
}
await page.mouse.move(cx + 180, cy - 80, { steps: 8 })
await page.waitForTimeout(350)
const headingAfterMouseLook = await headingPanel.innerText()
const pointerLockAcquired = await page.evaluate(() => Boolean(document.pointerLockElement))
if (pointerLockAcquired) {
  await page.evaluate(() => document.exitPointerLock())
  await page.waitForFunction(() => !document.pointerLockElement, undefined, { timeout: 5000 })
}
await page.getByRole('button', { name: 'EXIT · ESC' }).click()
await page.getByRole('button', { name: 'Enter flythrough' }).waitFor({ timeout: 12000 })
const exitedState = await storeState()

const mobileContext = await browser.newContext({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
})
const mobilePage = await mobileContext.newPage()
const mobileErrors = []
mobilePage.on('console', message => {
  if (message.type() === 'error') mobileErrors.push(`${message.text()} ${message.location().url}`.trim())
})
mobilePage.on('pageerror', error => mobileErrors.push(error.message))
await mobilePage.goto(baseUrl, { waitUntil: 'networkidle', timeout: 45000 })
await mobilePage.waitForFunction(() => !document.body.innerText.includes('INITIALIZING'), { timeout: 60000 })
await mobilePage.locator('#upload').scrollIntoViewIfNeeded()
await mobilePage.getByRole('button', { name: 'Run Demo Pipeline' }).click()
await mobilePage.waitForURL('**/explorer', { timeout: 60000 })
await mobilePage.getByText('GRID RESOLUTION').waitFor({ timeout: 15000 })
const mobileGridText = await mobilePage.getByText('GRID RESOLUTION').locator('..').innerText()
await mobilePage.getByRole('button', { name: 'Enter flythrough' }).click()
await mobilePage.getByRole('button', { name: 'EXIT · ESC' }).waitFor({ timeout: 12000 })
const touchControls = await Promise.all(
  ['Forward', 'Left', 'Back', 'Right', 'Climb', 'Descend'].map(name =>
    mobilePage.getByRole('button', { name }).isVisible(),
  ),
)
const mobileOverflowX = await mobilePage.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
)
await mobilePage.getByRole('button', { name: 'EXIT · ESC' }).click()

const result = {
  initial: canonicalState,
  visualChanges: {
    orbit: orbitDigest !== initialDigest,
    zoom: zoomDigest !== orbitDigest,
    pan: panDigest !== zoomDigest,
  },
  measurementCount: measuredState.measurements,
  selectedStructure: inspectedState.selectedStructure,
  projectedStructureCandidates: projectedStructures.length,
  flythroughMode: flyingState.cameraMode,
  exitedMode: exitedState.cameraMode,
  mouseLook: {
    pointerLockAcquired,
    headingBefore: headingBeforeMouseLook,
    headingAfter: headingAfterMouseLook,
    changed: headingBeforeMouseLook !== headingAfterMouseLook,
  },
  canvasCount: await page.locator('canvas[data-engine^="three.js"]').count(),
  errors,
  mobile: {
    gridText: mobileGridText,
    touchControlsVisible: touchControls.every(Boolean),
    overflowX: mobileOverflowX,
    errors: mobileErrors,
  },
}

await browser.close()
console.log(JSON.stringify(result))

if (result.initial.seed !== 26175 || result.initial.size !== 1024 || result.initial.samples !== 1048576) {
  throw new Error(`Canonical terrain contract failed: ${JSON.stringify(result.initial)}`)
}
if (result.initial.structures < 1) throw new Error('Canonical structures are missing.')
if (!Object.values(result.visualChanges).every(Boolean)) throw new Error('An orbit control did not change the rendered view.')
if (result.measurementCount < 1) throw new Error('Measure did not create a measurement.')
if (!result.selectedStructure) throw new Error('Inspect did not select a generated structure.')
if (result.flythroughMode !== 'flythrough' || result.exitedMode !== 'orbit') {
  throw new Error('Flythrough enter/exit mode transition failed.')
}
if ((!denyPointerLock && !result.mouseLook.pointerLockAcquired) || !result.mouseLook.changed) {
  throw new Error(`Flythrough mouse look failed: ${JSON.stringify(result.mouseLook)}`)
}
if (result.canvasCount !== 1) throw new Error(`Expected one explorer canvas, found ${result.canvasCount}.`)
if (errors.length) throw new Error(`Browser errors: ${errors.join(' | ')}`)
if (!result.mobile.gridText.includes('1024²')) {
  throw new Error(`Mobile canonical demo was not 1024²: ${result.mobile.gridText}`)
}
if (!result.mobile.touchControlsVisible) throw new Error('Mobile flythrough touch controls were not visible.')
if (result.mobile.overflowX > 1) throw new Error(`Mobile explorer overflowed by ${result.mobile.overflowX}px.`)
if (mobileErrors.length) throw new Error(`Mobile browser errors: ${mobileErrors.join(' | ')}`)
