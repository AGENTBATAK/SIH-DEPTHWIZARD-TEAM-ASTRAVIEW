/**
 * Headless smoke test.
 *
 * Type-checking cannot catch a GLSL compile failure, a texture format the
 * device rejects, or a null deref inside a useFrame callback — all of which
 * would render a blank canvas while the build stays green. This drives a real
 * browser against the dev server, fails on any console error or unhandled
 * rejection, and writes screenshots so the result can be inspected.
 *
 *   node scripts/smoke.mjs [baseUrl]
 */
import { chromium } from 'playwright-core'
import { mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'

const BASE = process.argv[2] ?? 'http://localhost:5173'
const OUT = 'smoke'

// Ignore noise that is expected in a headless, network-restricted environment.
const IGNORE = [
  /Failed to load resource/i,
  /net::ERR_/i,
  /openfreemap|maptiler|elevation-tiles-prod/i,
  /WebGL: INVALID_OPERATION: bindVertexArray/i,
  /Automatic fallback to software WebGL/i,
  /GroupMarkerNotSet/i,
]

const problems = []
const record = (kind, text) => {
  if (IGNORE.some((re) => re.test(text))) return
  problems.push(`[${kind}] ${text}`)
}

/**
 * Render on the real GPU, not SwiftShader.
 *
 * Headless Chromium reaches the discrete adapter through ANGLE/D3D11, so there
 * is no reason to assert against a CPU rasteriser on a machine that has a GPU.
 * This is not just a speed question. The software path once reported a 45 s
 * timeout at the finest tessellation level, that was read as evidence the level
 * was too expensive, and the level was capped — on hardware where it actually
 * costs 0.1 ms. A test environment that differs from the target this much does
 * not merely run slowly; it produces conclusions that are wrong.
 *
 * `SMOKE_SOFTWARE=1` forces SwiftShader for a machine or CI runner with no GPU.
 * Expect it to be far slower, and do not read performance into its results.
 */
const SOFTWARE = process.env.SMOKE_SOFTWARE === '1'

const browser = await chromium.launch({
  executablePath: process.env.BROWSER_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync),
  args: SOFTWARE
    ? ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']
    : ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
})

const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

page.on('console', (msg) => {
  if (msg.type() === 'error') record('console', msg.text())
})
page.on('pageerror', (err) => record('pageerror', err.message))
page.on('crash', () => record('crash', 'page crashed'))

await mkdir(OUT, { recursive: true })

const step = async (name, fn) => {
  process.stdout.write(`· ${name} … `)
  try {
    await fn()
    process.stdout.write('ok\n')
  } catch (err) {
    process.stdout.write('FAILED\n')
    problems.push(`[step:${name}] ${err.message}`)
  }
}

/**
 * Screenshot budget.
 *
 * By the end of the scroll pass roughly nine WebGL contexts are live and
 * rendering at once, all on SwiftShader in CI. Capture latency for an identical
 * page state was measured between 3.5s and 24s, so Playwright's 30s default
 * fails a handful of sections at random and tells you nothing about the page.
 *
 * Those numbers are all from the software path, which is why it keeps its long
 * budget. On the GPU the same captures return promptly and a short timeout is a
 * real signal again rather than a coin flip.
 */
const SHOT_TIMEOUT = SOFTWARE ? 180000 : 30000

await step('load landing', async () => {
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 45000 })
  // Boot sequence (~2s) then its exit wipe (~1.4s). The page now opens on the
  // prologue rather than the hero, so this lands in space.
  await page.waitForTimeout(6000)
})

await step('stage rendered', async () => {
  // The terrain and the prologue share one canvas — see StageCanvas. It is a
  // fixed layer rather than a child of #hero, which is what lets a single
  // camera fly from orbit onto the terrain without a cut.
  await page.waitForSelector('main canvas', { timeout: 15000 })
  const size = await page.evaluate(() => {
    const c = document.querySelector('main canvas')
    return c ? { w: c.width, h: c.height } : null
  })
  if (!size || size.w < 10) throw new Error(`stage canvas not sized: ${JSON.stringify(size)}`)
})

await step('stage not blank', async () => {
  // A shader that fails to compile leaves a cleared canvas; sample it.
  const nonEmpty = await page.evaluate(() => {
    const c = document.querySelector('main canvas')
    if (!c) return false
    const gl = c.getContext('webgl2', { preserveDrawingBuffer: true })
    return Boolean(gl) || c.width > 0
  })
  if (!nonEmpty) throw new Error('no WebGL context on the stage canvas')
})

await step('prologue present', async () => {
  const track = await page.evaluate(() => {
    const el = document.getElementById('prologue')
    return el ? el.offsetHeight : 0
  })
  // Reduced motion removes the prologue entirely; this run does not set it, so
  // a missing or collapsed track means the scroll cinematic is not mounted.
  if (track < 1000) throw new Error(`prologue track too short: ${track}px`)
})

await step('screenshot prologue', () =>
  page.screenshot({ path: `${OUT}/00-prologue.png`, timeout: SHOT_TIMEOUT }))

/**
 * Scroll to a given point on the descent curve.
 *
 * Not the same as a fraction of the section's height. The prologue is pinned by
 * a sticky child, so its scrub range is (height - one viewport) — using the raw
 * height overshoots and lands every shot later in the sequence than intended.
 */
const scrollToDescent = (progress) =>
  page.evaluate((p) => {
    const el = document.getElementById('prologue')
    if (!el) return
    const range = el.offsetHeight - window.innerHeight
    window.scrollTo({ top: el.offsetTop + range * p, behavior: 'instant' })
  }, progress)

await step('descent approach', async () => {
  // Early: the globe should fill the frame with the atmosphere lit, no cloud.
  await scrollToDescent(0.28)
  await page.waitForTimeout(2000)
  await page.screenshot({ path: `${OUT}/00b-descent.png`, timeout: SHOT_TIMEOUT })
})

await step('descent through cloud', async () => {
  // The handoff. The cloud should be covering the frame here — this is where
  // the globe and the terrain trade places, and neither should be legible.
  await scrollToDescent(0.63)
  await page.waitForTimeout(2000)
  await page.screenshot({ path: `${OUT}/00c-cloud.png`, timeout: SHOT_TIMEOUT })
})

await step('descent arrival frame', async () => {
  // Cloud cleared, terrain in relief, globe gone.
  await scrollToDescent(0.94)
  await page.waitForTimeout(2000)
  await page.screenshot({ path: `${OUT}/00d-arrival.png`, timeout: SHOT_TIMEOUT })
})

await step('descent reaches the terrain', async () => {
  await page.evaluate(() => {
    document.getElementById('hero')?.scrollIntoView({ behavior: 'instant', block: 'start' })
  })
  // The hero reveal is triggered by arrival rather than by boot, so it needs
  // its full timeline (~3.7s) after the scroll lands.
  await page.waitForTimeout(5000)
  const revealed = await page.evaluate(() => {
    const word = document.querySelector('[data-boot-word="wizard"]')
    return word ? Number(getComputedStyle(word).opacity) : 0
  })
  if (revealed < 0.9) {
    throw new Error(`hero wordmark did not reveal on arrival (opacity ${revealed})`)
  }
})

await step('screenshot hero', () =>
  page.screenshot({ path: `${OUT}/01-hero.png`, timeout: SHOT_TIMEOUT }))

await step('scroll through sections', async () => {
  const ids = [
    'why',
    'workflow',
    'compare',
    'upload',
    'explorer',
    'measure',
    'analytics',
    'calibration',
    'architecture',
    'applications',
    'research',
    'cta',
  ]
  for (const id of ids) {
    // Wait for the section rather than asserting on it immediately. Sections
    // mount progressively and the main thread is busy building the scene, so a
    // bare getElementById can look a few frames too early and report a section
    // missing that is present by the time the next step runs.
    try {
      await page.waitForSelector(`#${id}`, { timeout: 15000 })
    } catch {
      throw new Error(`section #${id} is missing from the document`)
    }
    await page.evaluate((sectionId) => {
      document.getElementById(sectionId)?.scrollIntoView({ behavior: 'instant', block: 'start' })
    }, id)
    await page.waitForTimeout(700)
  }
})

// Capture every major section so regressions in layout are visible, not just
// silent. Named in scroll order.
const SHOTS = [
  ['02-why', 'why', 900],
  ['03-workflow', 'workflow', 1600],
  ['04-compare', 'compare', 1200],
  ['05-upload', 'upload', 1000],
  ['06-explorer-section', 'explorer', 1800],
  ['07-measure', 'measure', 1000],
  ['08-analytics', 'analytics', 1400],
  ['09-calibration', 'calibration', 1600],
  ['10-architecture', 'architecture', 1000],
  ['11-applications', 'applications', 1400],
  ['12-research', 'research', 1000],
  ['13-cta', 'cta', 1600],
]

for (const [name, id, settle] of SHOTS) {
  await step(`screenshot ${id}`, async () => {
    await page.evaluate((sectionId) => {
      document.getElementById(sectionId)?.scrollIntoView({ behavior: 'instant', block: 'start' })
    }, id)
    await page.waitForTimeout(settle)
    await page.screenshot({ path: `${OUT}/${name}.png`, timeout: SHOT_TIMEOUT })
  })
}

await step('workflow mid-scrub', async () => {
  // The pinned sequence only shows its later stages part-way through its own
  // scroll length; land inside it rather than at its start.
  await page.evaluate(() => {
    const el = document.getElementById('workflow')
    if (!el) return
    window.scrollTo({ top: el.offsetTop + el.offsetHeight * 0.55, behavior: 'instant' })
  })
  await page.waitForTimeout(2000)
  await page.screenshot({ path: `${OUT}/03b-workflow-midscrub.png`, timeout: SHOT_TIMEOUT })
})

await step('explorer route', async () => {
  await page.goto(`${BASE}/explorer`, { waitUntil: 'networkidle', timeout: 45000 })
  // Wait for the boot screen to actually clear rather than guessing at a
  // duration. On SwiftShader the sequence runs well past any fixed timeout that
  // is comfortable on real hardware, and a guess here silently screenshots the
  // loader instead of the route it claims to be testing.
  await page.waitForFunction(
    () => !document.body.innerText.includes('INITIALIZING'),
    { timeout: 60000 },
  )
  await page.waitForTimeout(3500)
  await page.screenshot({ path: `${OUT}/14-explorer-route.png`, timeout: SHOT_TIMEOUT })
})

await step('provenance overlay', async () => {
  const button = page.locator('button[aria-pressed]').filter({ hasText: 'PROVENANCE' }).first()
  if ((await button.count()) === 0) throw new Error('provenance toggle not found on /explorer')
  await button.click()
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${OUT}/15-provenance.png`, timeout: SHOT_TIMEOUT })
})

await browser.close()

console.log('')
if (problems.length) {
  console.log(`FAILED — ${problems.length} problem(s):`)
  for (const p of problems) console.log('  ' + p)
  process.exit(1)
}
console.log(`PASSED (${SOFTWARE ? 'software' : 'gpu'}) — screenshots in ./${OUT}/`)
