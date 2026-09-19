import { createServer } from 'node:http'
import { mkdir, readFile, writeFile, rename, readdir, unlink, stat } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// The backend owns its runtime data, while the root project owns the built
// frontend that this local presentation server can optionally serve.
const root = fileURLToPath(new URL('../../../', import.meta.url))
const MAX_BODY = 7 * 1024 * 1024
const note = 'Presentation prototype: synthetic terrain unrelated to real image geometry. Scale and geographic footprint are illustrative.'
const tag = (value, unit, provenance = 'simulated', explanation = note) => ({ value, unit, provenance, note: explanation })
const fail = (status, message) => Object.assign(new Error(message), { status })

const WORK_ID = /^WORK-SIH-2026-\d{5}$/
const yieldToServer = () => new Promise(resolve => setImmediate(resolve))

function createSyntheticRecord(index, seed) {
  const brightness = Number((0.24 + ((index * 37 + seed) % 61) / 100).toFixed(3))
  const reliefSignal = Number((0.18 + ((index * 19 + seed * 3) % 67) / 100).toFixed(3))
  const roughness = Number((0.06 + ((index * 11 + seed * 5) % 44) / 100).toFixed(3))
  const record = {
    recordId: `SYN-${String(index + 1).padStart(3, '0')}`,
    tileX: index % 10,
    tileY: Math.floor(index / 10),
    brightness,
    reliefSignal,
    roughness,
  }
  // Deliberately malformed fixture rows demonstrate schema rejection. They are
  // generated locally and never contain personal or externally sourced data.
  if (index === 6) record.brightness = 1.18
  if (index === 22) record.reliefSignal = -0.04
  if (index === 57) record.roughness = 1.2
  if (index === 88) record.tileX = 14
  return record
}

function isValidSyntheticRecord(record) {
  return typeof record.recordId === 'string' &&
    Number.isInteger(record.tileX) && record.tileX >= 0 && record.tileX < 10 &&
    Number.isInteger(record.tileY) && record.tileY >= 0 && record.tileY < 10 &&
    [record.brightness, record.reliefSignal, record.roughness].every(value => Number.isFinite(value) && value >= 0 && value <= 1)
}

function addEvent(work, stage, message) {
  work.events.push({ timestamp: new Date().toISOString(), workId: work.workId, stage, message })
}

async function executeSyntheticWorkflow(work) {
  const started = performance.now()
  try {
    work.stage = 'generation'
    work.inputRecords = Array.from({ length: 100 }, (_, index) => createSyntheticRecord(index, work.seed))
    addEvent(work, 'generation', 'Synthetic dataset created')
    addEvent(work, 'generation', `${work.inputRecords.length} records received`)
    await yieldToServer()

    work.stage = 'validation'
    addEvent(work, 'validation', `Validating ${work.inputRecords.length} records`)
    const validRecords = []
    const rejectedRecords = []
    for (const record of work.inputRecords) {
      if (isValidSyntheticRecord(record)) validRecords.push(record)
      else rejectedRecords.push(record)
    }
    work.validation = { recordsReceived: work.inputRecords.length, validRecords: validRecords.length, rejectedRecords: rejectedRecords.length }
    addEvent(work, 'validation', `${rejectedRecords.length} invalid records detected`)
    await yieldToServer()

    work.stage = 'preprocessing'
    const cleanedRecords = validRecords.map(record => {
      const elevationIndex = Number((record.reliefSignal * 0.62 + record.brightness * 0.28 - record.roughness * 0.18).toFixed(4))
      return {
        ...record,
        normalizedBrightness: Number((record.brightness * 100).toFixed(1)),
        elevationIndex,
        terrainClass: elevationIndex >= 0.58 ? 'ridge' : elevationIndex >= 0.4 ? 'slope' : 'lowland',
      }
    })
    work.cleanedRecords = cleanedRecords
    addEvent(work, 'preprocessing', `Preprocessing completed for ${cleanedRecords.length} valid records`)
    await yieldToServer()

    work.stage = 'analysis'
    const classes = cleanedRecords.reduce((counts, record) => {
      counts[record.terrainClass]++
      return counts
    }, { lowland: 0, slope: 0, ridge: 0 })
    const averageElevationIndex = cleanedRecords.reduce((total, record) => total + record.elevationIndex, 0) / cleanedRecords.length
    const meanBrightness = cleanedRecords.reduce((total, record) => total + record.normalizedBrightness, 0) / cleanedRecords.length
    work.output = {
      workId: work.workId,
      processedRecords: cleanedRecords,
      result: {
        dominantTerrainClass: Object.entries(classes).sort((a, b) => b[1] - a[1])[0][0],
        terrainClassCounts: classes,
        averageElevationIndex: Number(averageElevationIndex.toFixed(4)),
        meanBrightness: Number(meanBrightness.toFixed(1)),
      },
    }
    addEvent(work, 'analysis', 'Analysis completed')
    await yieldToServer()

    work.stage = 'result'
    work.status = 'completed'
    work.processingTimeMs = Number((performance.now() - started).toFixed(2))
    addEvent(work, 'result', 'Result generated')
  } catch (error) {
    work.status = 'failed'
    work.stage = 'error'
    work.error = error instanceof Error ? error.message : 'Synthetic workflow failed.'
    work.processingTimeMs = Number((performance.now() - started).toFixed(2))
    addEvent(work, 'error', `Processing failed: ${work.error}`)
  }
}

function validate(input) {
  if (!input || typeof input !== 'object') throw fail(400, 'Expected a scene object.')
  const { filename, width, height, bytes, preview } = input
  if (typeof filename !== 'string' || filename.length > 180 || /[\\/\x00-\x1f]/.test(filename) || !/\.(png|jpe?g|tiff?)$/i.test(filename)) {
    throw fail(400, 'Choose a PNG, JPG or TIFF image with a valid filename.')
  }
  if (![width, height, bytes].every(v => Number.isSafeInteger(v) && v > 0) || width > 100000 || height > 100000 || bytes > 64 * 1024 * 1024) {
    throw fail(400, 'Invalid image dimensions or file size (maximum 64 MB).')
  }
  if (typeof preview !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(preview)) throw fail(400, 'A PNG preview is required.')
  const png = Buffer.from(preview.slice(22), 'base64')
  if (png.length < 33 || !png.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) || png.toString('ascii', 12, 16) !== 'IHDR' || png.readUInt32BE(16) < 1 || png.readUInt32BE(20) < 1 || png.readUInt32BE(16) > 1024 || png.readUInt32BE(20) > 1024) {
    throw fail(400, 'Preview must be a PNG no larger than 1024 × 1024.')
  }
  return { filename, width, height, bytes, preview }
}

function buildScene(input) {
  const started = performance.now()
  const { filename, width, height, bytes, preview } = validate(input)
  const seed = createHash('sha256').update(preview).digest().readUInt32LE()
  const size = 256
  const phase = (seed / 0xffffffff) * Math.PI * 2
  const heights = []
  let min = Infinity, max = -Infinity, sum = 0
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / (size - 1), v = y / (size - 1)
      const h = Math.fround(60 + 28 * Math.sin(u * 7 + phase) * Math.cos(v * 5 - phase) + 55 * Math.exp(-((u - .65) ** 2 + (v - .4) ** 2) * 14) + 7 * Math.sin(u * 24 + v * 13 + phase))
      heights.push(h)
      min = Math.min(min, h); max = Math.max(max, h); sum += h
    }
  }
  const calibration = { method: 'assumed-range', scale: tag(max - min, 'm / unit'), offset: tag(min, 'm'), sourceLabel: 'SYNTHETIC PRESENTATION TERRAIN' }
  const unavailable = unit => tag(null, unit, 'simulated', 'No reference elevation: accuracy metrics are unavailable for this prototype.')
  return {
    id: randomUUID(), name: filename.replace(/\.[^.]+$/, '').toUpperCase().slice(0, 28), source: 'upload', createdAt: Date.now(),
    image: { filename, format: /\.png$/i.test(filename) ? 'png' : /\.jpe?g$/i.test(filename) ? 'jpeg' : 'geotiff',
      width: tag(width, 'px', 'measured', 'Image width decoded by the browser.'), height: tag(height, 'px', 'measured', 'Image height decoded by the browser.'), size: tag(bytes, 'bytes', 'measured', 'Original file size reported by the browser.'), url: preview },
    geo: { georeferenced: false, extra: [{ key: 'MODE', value: tag('PRESENTATION PROTOTYPE') }] },
    depth: { data: heights.map(h => (h - min) / (max - min)), width: size, height: size, engine: 'simulated', isRelative: true,
      elapsedMs: tag(performance.now() - started, 'ms', 'derived', 'Server time to generate synthetic terrain; no inference performed.') },
    dsm: { heights, size, min: tag(min, 'm'), max: tag(max, 'm'), mean: tag(sum / heights.length, 'm'), calibration },
    terrain: { size, minElevation: min, maxElevation: max, extentMeters: 4096, bounds: [77.3926, 23.2399, 77.4326, 23.2799], structures: [], seed },
    metrics: { rmse: unavailable('m'), mae: unavailable('m'), correlation: unavailable(''), sampleCount: tag(0, 'cells'), referenceLabel: 'NO REFERENCE — PRESENTATION PROTOTYPE' },
  }
}

async function body(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw fail(415, 'Use application/json.')
  const chunks = []
  let length = 0
  for await (const chunk of req) {
    length += chunk.length
    if (length > MAX_BODY) throw fail(413, 'Image preview exceeds the 7 MB request limit.')
    chunks.push(chunk)
  }
  try { return JSON.parse(Buffer.concat(chunks).toString()) }
  catch { throw fail(400, 'Invalid JSON request.') }
}

export async function createApp({ dataDir = process.env.DATA_DIR || path.join(root, '.data', 'scenes'), distDir = path.join(root, 'dist') } = {}) {
  await mkdir(dataDir, { recursive: true })
  const workflowDir = path.join(dataDir, '..', 'workflows')
  const sequencePath = path.join(workflowDir, 'sequence.json')
  await mkdir(workflowDir, { recursive: true })
  let workSequence = 0
  try {
    const savedSequence = JSON.parse(await readFile(sequencePath, 'utf8'))
    if (Number.isInteger(savedSequence.value) && savedSequence.value >= 0) workSequence = savedSequence.value
  } catch { /* A fresh presentation starts at the first Work ID. */ }
  const workRuns = new Map()
  const nextWorkId = async () => {
    workSequence += 1
    const tempSequencePath = `${sequencePath}.${workSequence}.tmp`
    await writeFile(tempSequencePath, JSON.stringify({ value: workSequence }), { flag: 'w' })
    await rename(tempSequencePath, sequencePath)
    return `WORK-SIH-2026-${String(workSequence).padStart(5, '0')}`
  }
  return createServer(async (req, res) => {
    const json = (status, value) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
      res.end(JSON.stringify(value))
    }
    try {
      const url = new URL(req.url, 'http://localhost')
      // No cross-origin writes to this local presentation server.
      if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) throw fail(403, 'Cross-origin requests are not allowed.')
      if (url.pathname === '/api/health' && req.method === 'GET') return json(200, { status: 'ok', mode: 'presentation', ai: false, gis: false })
      if (url.pathname === '/api/demo-runs' && req.method === 'POST') {
        const workId = await nextWorkId()
        const work = {
          workId,
          status: 'processing',
          stage: 'generation',
          createdAt: new Date().toISOString(),
          seed: workSequence,
          events: [],
          inputRecords: [],
          cleanedRecords: [],
          validation: { recordsReceived: 0, validRecords: 0, rejectedRecords: 0 },
          output: null,
          processingTimeMs: null,
          error: null,
        }
        workRuns.set(workId, work)
        setImmediate(() => { void executeSyntheticWorkflow(work) })
        return json(202, work)
      }
      const workMatch = url.pathname.match(/^\/api\/demo-runs\/(WORK-SIH-2026-\d{5})$/)
      if (workMatch) {
        const workId = workMatch[1]
        if (!WORK_ID.test(workId)) throw fail(404, 'Work run not found.')
        const work = workRuns.get(workId)
        if (!work) throw fail(404, 'Work run not found.')
        if (req.method === 'GET') return json(200, work)
        if (req.method === 'DELETE') {
          workRuns.delete(workId)
          return json(200, { deleted: true, workId })
        }
        throw fail(405, 'Method not allowed.')
      }
      // `upload` and `process` are explicit prototype pipeline names. They
      // intentionally share the same local, synthetic implementation as the
      // legacy scenes POST so saved-scene compatibility is retained.
      if (url.pathname === '/api/upload' || url.pathname === '/api/process') {
        if (req.method !== 'POST') throw fail(405, 'Method not allowed.')
        const scene = buildScene(await body(req))
        const destination = path.join(dataDir, `${scene.id}.json`)
        await writeFile(`${destination}.tmp`, JSON.stringify(scene), { flag: 'wx' })
        await rename(`${destination}.tmp`, destination)
        return json(201, scene)
      }
      if (url.pathname === '/api/demo') {
        if (req.method !== 'POST') throw fail(405, 'Method not allowed.')
        // This compact PNG is only a deterministic input token. The generated
        // terrain remains explicitly synthetic and independent of real imagery.
        const preview = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL1VwAAAABJRU5ErkJggg=='
        const scene = buildScene({ filename: 'demo_scene_01.png', width: 1024, height: 1024, bytes: 1, preview })
        // Reuse the existing local presentation plate rather than shipping an
        // extra demo asset. It is visual context only, never evidence of GIS
        // inference, and the UI keeps that distinction visible.
        return json(200, {
          ...scene,
          id: 'demo_26175',
          source: 'demo',
          createdAt: 0,
          image: { ...scene.image, url: '/textures/earth-color.webp' },
        })
      }
      if (url.pathname === '/api/scenes') {
        if (req.method === 'POST') {
          const scene = buildScene(await body(req))
          const destination = path.join(dataDir, `${scene.id}.json`)
          await writeFile(`${destination}.tmp`, JSON.stringify(scene), { flag: 'wx' })
          await rename(`${destination}.tmp`, destination)
          return json(201, scene)
        }
        if (req.method === 'GET') {
          const scenes = []
          for (const filename of await readdir(dataDir)) {
            if (!filename.endsWith('.json')) continue
            try {
              const scene = JSON.parse(await readFile(path.join(dataDir, filename), 'utf8'))
              scenes.push({ id: scene.id, name: scene.name, filename: scene.image.filename, createdAt: scene.createdAt })
            } catch { /* A damaged record must not hide the other saved scenes. */ }
          }
          return json(200, scenes.sort((a, b) => b.createdAt - a.createdAt))
        }
        throw fail(405, 'Method not allowed.')
      }
      const match = url.pathname.match(/^\/api\/scenes\/([a-f0-9-]{36})$/)
      if (match) {
        const filename = path.join(dataDir, `${match[1]}.json`)
        if (req.method === 'GET') return json(200, JSON.parse(await readFile(filename, 'utf8')))
        if (req.method === 'DELETE') { await unlink(filename); return json(200, { deleted: true }) }
        throw fail(405, 'Method not allowed.')
      }
      if (url.pathname.startsWith('/api/')) throw fail(404, 'API endpoint not found.')
      if (req.method !== 'GET' && req.method !== 'HEAD') throw fail(405, 'Method not allowed.')
      const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '')
      let filename = path.resolve(distDir, relative || 'index.html')
      if (!filename.startsWith(path.resolve(distDir) + path.sep)) throw fail(403, 'Invalid path.')
      try { if (!(await stat(filename)).isFile()) throw new Error('Not a file') }
      catch {
        if (path.extname(relative)) throw fail(404, 'File not found.')
        filename = path.join(distDir, 'index.html')
      }
      const content = await readFile(filename)
      const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ico': 'image/x-icon' }
      res.writeHead(200, { 'Content-Type': mime[path.extname(filename)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' })
      res.end(req.method === 'HEAD' ? undefined : content)
    } catch (error) {
      const status = error.status || (error.code === 'ENOENT' ? 404 : 500)
      if (status === 500) console.error(error)
      json(status, { error: status === 500 ? 'The server could not save or load the scene. Check the server terminal.' : status === 404 ? 'Scene or file not found.' : error.message })
    }
  })
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = await createApp()
  server.listen(Number(process.env.PORT || 3001), '127.0.0.1', () => console.log(`DepthWizard prototype: http://127.0.0.1:${server.address().port}`))
}
