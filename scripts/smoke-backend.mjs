import { chromium } from 'playwright-core'
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import assert from 'node:assert/strict'

const base = process.argv[2] || 'http://localhost:5173'
const executablePath = process.env.BROWSER_PATH || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(existsSync)
const browser = await chromium.launch({ executablePath, args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' })
const errors = []
const external = []
page.on('pageerror', error => errors.push(error.message))
page.on('request', request => {
  if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== new URL(base).origin) external.push(request.url())
})
let id
let workId
try {
  const existingScenesResponse = await page.request.get(`${base}/api/scenes`)
  if (existingScenesResponse.ok()) {
    const existingScenes = await existingScenesResponse.json()
    for (const scene of existingScenes) {
      if (scene.filename === 'prototype-browser-test.png') {
        await page.request.delete(`${base}/api/scenes/${scene.id}`)
      }
    }
  }
  await page.goto(base, { waitUntil: 'networkidle' })
  await page.locator('#upload').scrollIntoViewIfNeeded()
  await page.getByRole('button', { name: 'Refresh scenes' }).waitFor()
  // The SIH judge workflow must show the backend-generated fixture, its unique
  // Work ID, actual event trail, and the output derived from those records.
  const workflowResponse = page.waitForResponse(response => response.url().endsWith('/api/demo-runs') && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Process Synthetic Data', exact: true }).click()
  const workflow = await workflowResponse
  assert.equal(workflow.status(), 202)
  workId = (await workflow.json()).workId
  await page.getByText(workId, { exact: true }).waitFor()
  await page.getByText('Valid records', { exact: true }).waitFor()
  await page.waitForFunction(id => document.body.innerText.includes('STATUS: COMPLETED') && document.body.innerText.includes(id), workId)
  const processingCopy = await page.getByTestId('synthetic-workflow').innerText()
  assert.match(processingCopy, /RECORDS RECEIVED\s*100/)
  assert.match(processingCopy, /VALID RECORDS\s*96/)
  assert.match(processingCopy, /REJECTED RECORDS\s*4/)
  await page.getByText(/View Processing Details/i).click()
  const eventCopy = await page.getByTestId('synthetic-workflow').innerText()
  assert.ok(eventCopy.includes('Synthetic dataset created'))
  assert.ok(eventCopy.includes('4 invalid records detected'))
  assert.ok(eventCopy.includes('Analysis completed'))
  await page.getByRole('tab', { name: 'Input Data', exact: true }).click()
  await page.getByText('Rejected by schema', { exact: true }).first().waitFor()
  await page.getByRole('tab', { name: 'Processed Output', exact: true }).click()
  await page.getByText('FINAL PROCESSED RECORD', { exact: true }).waitFor()
  await page.screenshot({ path: 'smoke/synthetic-workflow.png' })
  const resetWork = page.waitForResponse(response => response.url().endsWith(`/api/demo-runs/${workId}`) && response.request().method() === 'DELETE')
  await page.getByRole('button', { name: 'Reset', exact: true }).click()
  assert.equal((await resetWork).status(), 200)
  await page.getByText('READY FOR A NEW WORK RUN', { exact: true }).waitFor()
  workId = undefined
  // Demo button must use the existing scene/store/renderer path and arrive at
  // the unchanged explorer with its existing flythrough control available.
  await page.getByRole('button', { name: 'Run Demo Pipeline', exact: true }).click()
  await page.waitForURL('**/explorer')
  await page.getByText('DEMO COMPLETE — TERRAIN READY', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Enter flythrough', exact: true }).waitFor()
  await page.getByRole('link', { name: 'BACK TO OVERVIEW' }).click()
  await page.locator('#upload').scrollIntoViewIfNeeded()
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 160; canvas.height = 120
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#526c56'; ctx.fillRect(0, 0, 160, 120)
    ctx.fillStyle = '#e4d9ae'; ctx.fillRect(35, 20, 65, 50)
    return canvas.toDataURL().split(',')[1]
  })
  const responsePromise = page.waitForResponse(response => response.url().endsWith('/api/process') && response.request().method() === 'POST')
  await page.locator('input[type=file]').setInputFiles({ name: 'prototype-browser-test.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') })
  const response = await responsePromise
  assert.equal(response.status(), 201)
  const scene = await response.json()
  id = scene.id
  await page.getByText('Viewing a saved prototype scene.', { exact: false }).waitFor()
  await page.waitForFunction(() => !document.querySelector('[role=dialog]'))
  await page.reload({ waitUntil: 'networkidle' })
  await page.locator('#upload').scrollIntoViewIfNeeded()
  const row = page.locator('li').filter({ hasText: 'prototype-browser-test.png' }).first()
  await row.getByRole('button', { name: 'Open scene', exact: true }).click()
  await page.getByText('Viewing a saved prototype scene.', { exact: false }).waitFor()
  await mkdir('smoke', { recursive: true })
  await page.screenshot({ path: 'smoke/prototype-saved-scene.png' })
  // Client navigation must preserve the loaded backend scene in the shared store.
  await page.locator('#explorer').getByRole('button', { name: 'Launch full explorer', exact: true }).click()
  await page.waitForURL('**/explorer')
  await page.waitForFunction(() => [...document.querySelectorAll('canvas')].some(canvas => canvas.width > 0 && canvas.height > 0))
  assert.ok((await page.locator('body').innerText()).includes('PROTOTYPE-BROWSER-TEST'))
  // Canvas allocation precedes texture loading: verify painted terrain, not just its size.
  let painted = false
  for (let attempt = 0; attempt < 12 && !painted; attempt++) {
    await page.waitForTimeout(500)
    const shot = await page.screenshot({ path: 'smoke/prototype-explorer.png' })
    painted = await page.evaluate(async base64 => {
      const image = new Image()
      image.src = `data:image/png;base64,${base64}`
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = 800; canvas.height = 650
      const ctx = canvas.getContext('2d')
      ctx.drawImage(image, 180, 170, 800, 650, 0, 0, 800, 650)
      const pixels = ctx.getImageData(0, 0, 800, 650).data
      let count = 0
      for (let i = 0; i < pixels.length; i += 4) if (Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) > 45) count++
      return count > 10000
    }, shot.toString('base64'))
  }
  assert.ok(painted, 'Uploaded terrain must visibly render in the explorer')
  await page.getByRole('link', { name: 'BACK TO OVERVIEW' }).click()
  await page.locator('#upload').scrollIntoViewIfNeeded()
  const deletion = page.waitForResponse(response => response.url().endsWith(`/api/scenes/${id}`) && response.request().method() === 'DELETE')
  await page.locator('li').filter({ hasText: 'prototype-browser-test.png' }).first().getByRole('button', { name: 'Delete saved scene' }).click()
  assert.equal((await deletion).status(), 200)
  await page.waitForFunction(() => ![...document.querySelectorAll('li')].some(li => li.textContent.includes('prototype-browser-test.png')))
  assert.deepEqual(errors, [])
  assert.deepEqual(external, [], 'Default presentation must not depend on external services')
  console.log('PASS: upload, persistence after reload, reopen, explorer, deletion; no page errors or external requests.')
} finally {
  if (id) await page.request.delete(`${base}/api/scenes/${id}`)
  if (workId) await page.request.delete(`${base}/api/demo-runs/${workId}`)
  await browser.close()
}
