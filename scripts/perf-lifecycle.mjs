import { chromium } from 'playwright-core'
import { existsSync } from 'node:fs'

const baseUrl = process.argv[2] ?? 'http://localhost:5173'
const executablePath = process.env.BROWSER_PATH || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(existsSync)

const browser = await chromium.launch({
  executablePath,
  args: [
    '--use-angle=d3d11',
    '--ignore-gpu-blocklist',
    '--enable-unsafe-swiftshader',
    '--js-flags=--expose-gc',
  ],
})

async function createTrackedPage(context) {
  const page = await context.newPage()
  const errors = []
  page.on('console', message => {
    if (message.type() === 'error') {
      errors.push(`${message.text()} ${message.location().url}`.trim())
    }
  })
  page.on('pageerror', error => errors.push(error.message))
  return { page, errors }
}

async function waitForBoot(page) {
  await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 45000 })
  await page.waitForFunction(() => !document.body.innerText.includes('INITIALIZING'), {
    timeout: 60000,
  })
}

async function scrollSnapshot(page, section) {
  await page.locator(`#${section}`).evaluate(element => {
    element.scrollIntoView({ block: 'center', behavior: 'instant' })
  })
  await page.waitForTimeout(450)
  return page.evaluate(sectionId => ({
    section: sectionId,
    domCanvasCount: document.querySelectorAll('canvas').length,
    webglCanvasCount: document.querySelectorAll('canvas[data-engine^="three.js"]').length,
    scrollY: Math.round(window.scrollY),
    overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }), section)
}

async function collectHeap(page) {
  await page.evaluate(() => globalThis.gc?.())
  const session = await page.context().newCDPSession(page)
  await session.send('Performance.enable')
  await session.send('HeapProfiler.collectGarbage')
  const { metrics } = await session.send('Performance.getMetrics')
  await session.detach()
  return metrics.find(metric => metric.name === 'JSHeapUsedSize')?.value ?? null
}

async function runPass(page, sections) {
  const snapshots = []
  for (const section of sections) snapshots.push(await scrollSnapshot(page, section))
  return snapshots
}

const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const desktop = await createTrackedPage(desktopContext)
await waitForBoot(desktop.page)

const sections = ['prologue', 'why', 'workflow', 'upload', 'explorer', 'analytics', 'cta']
const firstPass = await runPass(desktop.page, sections)
const heapAfterFirstPass = await collectHeap(desktop.page)
const secondPass = await runPass(desktop.page, [...sections].reverse())
const heapAfterSecondPass = await collectHeap(desktop.page)

const desktopResult = {
  firstPass,
  secondPass,
  heapAfterFirstPass,
  heapAfterSecondPass,
  heapDelta: heapAfterFirstPass === null || heapAfterSecondPass === null
    ? null
    : heapAfterSecondPass - heapAfterFirstPass,
  errors: desktop.errors,
}

const mobileContext = await browser.newContext({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
  reducedMotion: 'reduce',
})
const mobile = await createTrackedPage(mobileContext)
await waitForBoot(mobile.page)
const reducedMotionBypassedPrologue = await mobile.page.locator('#prologue').count() === 0
const mobileSnapshots = await runPass(mobile.page, ['hero', 'workflow', 'upload', 'explorer', 'cta'])
const mobileResult = {
  snapshots: mobileSnapshots,
  reducedMotion: await mobile.page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
  reducedMotionBypassedPrologue,
  errors: mobile.errors,
}

await browser.close()

const result = { desktop: desktopResult, mobile: mobileResult }
console.log(JSON.stringify(result))

const allSnapshots = [...firstPass, ...secondPass, ...mobileSnapshots]
const maxWebglCanvasCount = Math.max(...allSnapshots.map(snapshot => snapshot.webglCanvasCount))
const overflow = allSnapshots.filter(snapshot => snapshot.overflowX > 1)
const desktopBySection = new Map(firstPass.map(snapshot => [snapshot.section, snapshot.webglCanvasCount]))
const remounted = ['prologue', 'workflow', 'explorer', 'cta'].every(section =>
  desktopBySection.get(section) === 1
  && secondPass.find(snapshot => snapshot.section === section)?.webglCanvasCount === 1
)
const heapGrowthLimit = 24 * 1024 * 1024

if (desktop.errors.length || mobile.errors.length) {
  throw new Error(`Browser errors: ${[...desktop.errors, ...mobile.errors].join(' | ')}`)
}
if (maxWebglCanvasCount > 1) {
  throw new Error(`More than one WebGL canvas was mounted: ${maxWebglCanvasCount}`)
}
if (overflow.length) throw new Error(`Horizontal overflow: ${JSON.stringify(overflow)}`)
if (!remounted) throw new Error('A WebGL section did not remount on the second scroll pass.')
if (!mobileResult.reducedMotion) throw new Error('Reduced-motion media query was not active.')
if (!mobileResult.reducedMotionBypassedPrologue) {
  throw new Error('Reduced-motion mode did not bypass the cinematic prologue.')
}
if (desktopResult.heapDelta !== null && desktopResult.heapDelta > heapGrowthLimit) {
  throw new Error(`Settled heap grew by ${Math.round(desktopResult.heapDelta / 1024 / 1024)} MiB.`)
}
