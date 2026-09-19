import { chromium } from 'playwright-core'
import { existsSync } from 'node:fs'

const baseUrl = process.argv[2] ?? 'http://localhost:5173'
const executablePath = process.env.BROWSER_PATH || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(existsSync)

const browser = await chromium.launch({
  executablePath,
  args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('console', message => {
  if (message.type() === 'error') errors.push(`${message.text()} ${message.location().url}`.trim())
})
page.on('pageerror', error => errors.push(error.message))

await page.addInitScript(() => {
  window.__dwLongTasks = []
  new PerformanceObserver(list => {
    for (const entry of list.getEntries()) window.__dwLongTasks.push(entry.duration)
  }).observe({ type: 'longtask', buffered: true })
})

await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 45000 })
await page.waitForFunction(() => !document.body.innerText.includes('INITIALIZING'), { timeout: 60000 })
await page.locator('#upload').scrollIntoViewIfNeeded()
await page.evaluate(() => { window.__dwLongTasks = [] })
await page.getByRole('button', { name: 'Run Demo Pipeline' }).click()
await page.waitForURL('**/explorer', { timeout: 60000 })
const pipelineLongTasks = await page.evaluate(() => [...window.__dwLongTasks])
await page.evaluate(() => { window.__dwLongTasks = [] })
await page.getByText('DEMO COMPLETE').waitFor({ timeout: 15000 })
await page.getByText('GRID RESOLUTION').waitFor({ timeout: 15000 })

const result = await page.evaluate(() => ({
  longTasks: window.__dwLongTasks,
  canvasCount: document.querySelectorAll('canvas').length,
  bodyText: document.body.innerText,
  url: location.href,
}))
const maxLongTask = Math.max(0, ...result.longTasks)
const maxPipelineLongTask = Math.max(0, ...pipelineLongTasks)
const canonical = result.bodyText.includes('1024²') && result.bodyText.includes('DEMO_SCENE_01')

await browser.close()

console.log(JSON.stringify({
  canonical,
  canvasCount: result.canvasCount,
  longTaskCount: result.longTasks.length,
  maxLongTaskMs: Math.round(maxLongTask),
  maxPipelineLongTaskMs: Math.round(maxPipelineLongTask),
  consoleErrors: errors.length,
  errors,
  url: result.url,
  gridText: result.bodyText.match(/GRID RESOLUTION[^\n]*\n?[^\n]*/)?.[0] ?? null,
  sceneText: result.bodyText.match(/DEPTHWIZARD[^\n]*DEMO_SCENE_01/)?.[0] ?? null,
}))

if (!canonical) throw new Error('Canonical 1024² demo scene was not rendered.')
if (errors.length) throw new Error(`Browser errors: ${errors.join(' | ')}`)
if (maxPipelineLongTask > 250) throw new Error(`Demo pipeline blocked the main thread for ${Math.round(maxPipelineLongTask)} ms.`)
if (maxLongTask > 1000) throw new Error(`Explorer startup blocked the main thread for ${Math.round(maxLongTask)} ms.`)
