import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createApp } from './index.mjs'

const input = { filename: 'presentation.png', width: 1, height: 1, bytes: 68,
  preview: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=' }
const start = async dataDir => {
  const server = await createApp({ dataDir })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  return { server, url: `http://127.0.0.1:${server.address().port}` }
}
const close = server => new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()))
const waitForRun = async (url, workId) => {
  for (let attempt = 0; attempt < 30; attempt++) {
    const run = await (await fetch(`${url}/api/demo-runs/${workId}`)).json()
    if (run.status !== 'processing') return run
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw new Error('Synthetic work run did not settle.')
}

test('scene lifecycle, persistence and truthful frontend data contract', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'depthwizard-'))
  let app = await start(dir)
  try {
    assert.equal((await (await fetch(app.url + '/api/health')).json()).ai, false)
    const created = await fetch(app.url + '/api/scenes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })
    assert.equal(created.status, 201)
    const scene = await created.json()
    assert.equal(scene.dsm.heights.length, scene.dsm.size ** 2)
    assert.equal(scene.depth.data.length, scene.dsm.heights.length)
    assert.equal(scene.geo.georeferenced, false)
    assert.equal(scene.metrics.rmse.value, null)
    assert.equal(scene.dsm.min.provenance, 'simulated')
    assert.ok(scene.dsm.heights.every(Number.isFinite))
    const { scale, offset } = scene.dsm.calibration
    for (let i = 0; i < scene.dsm.heights.length; i += 71) {
      assert.ok(Math.abs(scene.depth.data[i] * scale.value + offset.value - scene.dsm.heights[i]) < 0.0001)
    }
    await close(app.server)
    app = await start(dir)
    const saved = await (await fetch(`${app.url}/api/scenes/${scene.id}`)).json()
    assert.deepEqual(saved, scene)
    const list = await (await fetch(app.url + '/api/scenes')).json()
    assert.equal(list[0].id, scene.id)
    assert.equal((await fetch(`${app.url}/api/scenes/${scene.id}`, { method: 'DELETE' })).status, 200)
    assert.equal((await fetch(`${app.url}/api/scenes/${scene.id}`)).status, 404)
    assert.deepEqual(await (await fetch(app.url + '/api/scenes')).json(), [])
  } finally { await close(app.server); await rm(dir, { recursive: true, force: true }) }
})

test('invalid uploads and cross-origin writes are rejected without records', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'depthwizard-'))
  const app = await start(dir)
  const send = (body, headers = {}) => fetch(app.url + '/api/scenes', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) })
  try {
    for (const bad of [null, {}, { ...input, filename: '../x.png' }, { ...input, width: -1 }, { ...input, bytes: 65 * 1024 * 1024 }, { ...input, preview: 'data:image/png;base64,aGVsbG8=' }]) {
      assert.equal((await send(bad)).status, 400)
    }
    assert.equal((await send('{')).status, 400)
    assert.equal((await send(input, { Origin: 'https://example.com' })).status, 403)
    assert.equal((await send(input, { 'Content-Type': 'text/plain' })).status, 415)
    assert.equal((await send('x'.repeat(7 * 1024 * 1024 + 1))).status, 413)
    assert.equal((await fetch(app.url + '/api/no-such-route')).status, 404)
    assert.deepEqual(await (await fetch(app.url + '/api/scenes')).json(), [])
  } finally { await close(app.server); await rm(dir, { recursive: true, force: true }) }
})

test('synthetic work run performs generation, validation, preprocessing and analysis under one Work ID', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'depthwizard-workflow-'))
  const app = await start(dir)
  try {
    const created = await fetch(app.url + '/api/demo-runs', { method: 'POST' })
    assert.equal(created.status, 202)
    const pending = await created.json()
    assert.match(pending.workId, /^WORK-SIH-2026-\d{5}$/)
    const complete = await waitForRun(app.url, pending.workId)
    assert.equal(complete.status, 'completed')
    assert.equal(complete.stage, 'result')
    assert.equal(complete.inputRecords.length, 100)
    assert.deepEqual(complete.validation, { recordsReceived: 100, validRecords: 96, rejectedRecords: 4 })
    assert.equal(complete.cleanedRecords.length, 96)
    assert.equal(complete.output.workId, pending.workId)
    assert.equal(complete.output.processedRecords.length, 96)
    assert.ok(complete.output.processedRecords.every(record => record.elevationIndex >= 0 && ['lowland', 'slope', 'ridge'].includes(record.terrainClass)))
    assert.ok(complete.processingTimeMs >= 0)
    assert.deepEqual(complete.events.map(event => event.workId), Array(complete.events.length).fill(pending.workId))
    assert.deepEqual(complete.events.map(event => event.message), [
      'Synthetic dataset created',
      '100 records received',
      'Validating 100 records',
      '4 invalid records detected',
      'Preprocessing completed for 96 valid records',
      'Analysis completed',
      'Result generated',
    ])
    const next = await (await fetch(app.url + '/api/demo-runs', { method: 'POST' })).json()
    assert.notEqual(next.workId, pending.workId)
    assert.equal((await fetch(`${app.url}/api/demo-runs/${pending.workId}`, { method: 'DELETE' })).status, 200)
    assert.equal((await fetch(`${app.url}/api/demo-runs/${pending.workId}`)).status, 404)
  } finally { await close(app.server); await rm(dir, { recursive: true, force: true }) }
})
