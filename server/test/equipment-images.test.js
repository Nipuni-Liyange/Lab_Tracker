const { before, after, test } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { once } = require('node:events')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')
const sharp = require('sharp')
const app = require('../index')
const User = require('../models/User')
const Session = require('../models/Session')
const Equipment = require('../models/Equipment')
const databaseName = `lab_tracker_image_test_${randomUUID().replaceAll('-', '')}`
let server, baseUrl, adminCookie, studentCookie, directory
const originalDirectory = process.env.EQUIPMENT_IMAGE_DIR
const fields = code => ({ name: 'Image test equipment', assetCode: code, category: 'Electronics', location: 'Test Lab', description: 'Test', instructions: '' })
const bytes = format => sharp({ create: { width: 32, height: 24, channels: 3, background: '#2777bb' } }).toFormat(format).toBuffer()
async function json(url, cookie, body, method = 'POST') {
  return fetch(`${baseUrl}${url}`, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) })
}
async function upload({ code = randomUUID(), item, file, type = 'image/png', filename = 'equipment.png', cookie = adminCookie, origin, extra, secondFile = false }) {
  const body = new FormData()
  for (const [key, value] of Object.entries(item ? { ...fields(item.assetCode), status: 'available', revision: item.revision } : fields(code))) body.append(key, String(value))
  if (extra) for (const [key, value] of Object.entries(extra)) body.set(key, value)
  body.append('image', new Blob([file ?? await bytes('png')], { type }), filename)
  if (secondFile) body.append('image', new Blob([await bytes('png')], { type }), filename)
  return fetch(`${baseUrl}/api/lab/equipment${item ? `/${item._id}` : ''}`, { method: item ? 'PATCH' : 'POST',
    headers: { ...(cookie ? { Cookie: cookie } : {}), ...(origin === null ? {} : { Origin: origin || baseUrl }) }, body })
}
async function getImage(url, cookie = studentCookie) {
  return fetch(`${baseUrl}${url}`, { headers: cookie ? { Cookie: cookie } : {} })
}
before(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'lab-track-image-test-'))
  process.env.EQUIPMENT_IMAGE_DIR = directory
  await mongoose.connect(process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27017', { dbName: databaseName, serverSelectionTimeoutMS: 5000 })
  await Promise.all([User.init(), Session.init(), Equipment.init()])
  const password = 'Image-Test-Password!'
  const passwordHash = await bcrypt.hash(password, 4)
  await User.create([{ name: 'Image admin', email: 'admin@image.test', role: 'admin', passwordHash }, { name: 'Image student', email: 'student@image.test', role: 'student', registrationNumber: 'image-test', passwordHash }])
  server = app.listen(0, '127.0.0.1'); await once(server, 'listening')
  baseUrl = `http://127.0.0.1:${server.address().port}`
  adminCookie = (await json('/api/auth/login', null, { email: 'admin@image.test', password })).headers.getSetCookie().at(-1).split(';')[0]
  studentCookie = (await json('/api/auth/login', null, { email: 'student@image.test', password })).headers.getSetCookie().at(-1).split(';')[0]
})
after(async () => {
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
  if (mongoose.connection.name === databaseName) await mongoose.connection.dropDatabase()
  await mongoose.disconnect()
  if (directory) await fs.rm(directory, { recursive: true, force: true })
  if (originalDirectory === undefined) delete process.env.EQUIPMENT_IMAGE_DIR
  else process.env.EQUIPMENT_IMAGE_DIR = originalDirectory
})

test('JPG, PNG and WebP are saved to their equipment and served to signed-in students/admins', async () => {
  for (const [format, mime, extension] of [['jpeg', 'image/jpeg', 'jpg'], ['png', 'image/png', 'png'], ['webp', 'image/webp', 'webp']]) {
    const response = await upload({ file: await bytes(format), type: mime, filename: `../../unsafe-name.${extension}` })
    assert.equal(response.status, 201, await response.clone().text())
    const item = (await response.json()).equipment
    assert.match(item.imageUrl, new RegExp(`/api/lab/equipment/${item._id}/image/[0-9a-f-]{36}\\.${extension}$`))
    const saved = await Equipment.findById(item._id)
    assert.ok(!saved.image.includes('unsafe'))
    for (const cookie of [studentCookie, adminCookie]) {
      const image = await getImage(item.imageUrl, cookie)
      assert.equal(image.status, 200)
      assert.ok(image.headers.get('content-type').startsWith(mime))
      assert.equal(image.headers.get('x-content-type-options'), 'nosniff')
      assert.equal((await sharp(Buffer.from(await image.arrayBuffer())).metadata()).format, format)
    }
    assert.equal((await getImage(item.imageUrl, null)).status, 401)
  }
})

test('JSON equipment creation remains compatible and cannot inject image filenames', async () => {
  const response = await json('/api/lab/equipment', adminCookie, { ...fields('NO-IMAGE'), image: '../../.env', imageUrl: 'https://untrusted.test/x' })
  const item = (await response.json()).equipment
  assert.equal(response.status, 201)
  assert.equal(item.imageUrl, null)
  assert.equal((await Equipment.findById(item._id)).image, undefined)
})

test('anonymous/student uploads and foreign/missing origins cannot write files', async () => {
  const beforeFiles = await fs.readdir(directory)
  assert.equal((await upload({ cookie: null })).status, 401)
  assert.equal((await upload({ cookie: studentCookie })).status, 403)
  assert.equal((await upload({ origin: 'https://untrusted.test' })).status, 403)
  assert.equal((await upload({ origin: null })).status, 403)
  const item = (await (await upload({})).json()).equipment
  assert.equal((await upload({ item, cookie: studentCookie })).status, 403)
  assert.equal((await fs.readdir(directory)).length, beforeFiles.length + 1)
})

test('spoofed, corrupt, unsupported, oversized and multiple files leave no records or files', async () => {
  const beforeCount = await Equipment.countDocuments()
  const beforeFiles = await fs.readdir(directory)
  const cases = [
    { file: Buffer.from('<html>not an image</html>') },
    { file: (await bytes('png')).subarray(0, 30) },
    { file: await bytes('jpeg'), type: 'image/png' },
    { type: 'image/svg+xml', filename: 'test.svg', file: Buffer.from('<svg/>') },
    { filename: 'test.exe' },
    { secondFile: true },
    { file: Buffer.alloc(5 * 1024 * 1024 + 1), expected: 413 }
  ]
  for (const value of cases) assert.equal((await upload(value)).status, value.expected || 400)
  assert.equal(await Equipment.countDocuments(), beforeCount)
  assert.deepEqual(await fs.readdir(directory), beforeFiles)
})

test('a file exactly 5 MiB is allowed and re-encoding strips appended bytes', async () => {
  const png = await bytes('png')
  const file = Buffer.concat([png, Buffer.alloc(5 * 1024 * 1024 - png.length)])
  const response = await upload({ file })
  assert.equal(response.status, 201, await response.clone().text())
  const item = (await response.json()).equipment
  assert.ok((await (await getImage(item.imageUrl)).arrayBuffer()).byteLength < file.length)
})

test('failed creation and stale/concurrent replacements do not leave orphan files or lose the old image', async () => {
  const item = (await (await upload({ code: 'CONCURRENT' })).json()).equipment
  const oldFilename = (await Equipment.findById(item._id)).image
  const beforeFiles = await fs.readdir(directory)
  assert.equal((await upload({ code: item.assetCode })).status, 409)
  assert.deepEqual(await fs.readdir(directory), beforeFiles)
  const results = await Promise.all([upload({ item }), upload({ item })])
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409])
  const updated = (await results.find(r => r.status === 200).json()).equipment
  assert.notEqual(updated.imageUrl, item.imageUrl)
  assert.equal((await getImage(item.imageUrl)).status, 404)
  assert.equal((await getImage(updated.imageUrl)).status, 200)
  assert.ok(!(await fs.readdir(directory)).includes(oldFilename))
  assert.equal((await fs.readdir(directory)).length, beforeFiles.length)
  assert.equal((await upload({ item })).status, 409)
  assert.equal((await getImage(updated.imageUrl)).status, 200)
})

test('editing without a new file preserves the image; image access is scoped to its equipment', async () => {
  const item = (await (await upload({})).json()).equipment
  const edited = await json(`/api/lab/equipment/${item._id}`, adminCookie, { ...item, name: 'Renamed', image: 'fake.png' }, 'PATCH')
  assert.equal(edited.status, 200)
  assert.equal((await edited.json()).equipment.imageUrl, item.imageUrl)
  assert.equal((await getImage(item.imageUrl.replace(item._id, new mongoose.Types.ObjectId().toString()))).status, 404)
  assert.equal((await getImage(`/api/lab/equipment/${item._id}/image/.env`)).status, 404)
  await Equipment.updateOne({ _id: item._id }, { $set: { status: 'archived' } })
  assert.equal((await getImage(item.imageUrl)).status, 404)
  assert.equal((await getImage(item.imageUrl, adminCookie)).status, 200)
})

test('stored images remain readable after the HTTP server restarts; a missing file gives 404', async () => {
  const item = (await (await upload({})).json()).equipment
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve))
  server = app.listen(0, '127.0.0.1'); await once(server, 'listening')
  baseUrl = `http://127.0.0.1:${server.address().port}`
  assert.equal((await getImage(item.imageUrl)).status, 200)
  const saved = await Equipment.findById(item._id)
  await fs.unlink(path.join(directory, saved.image))
  assert.equal((await getImage(item.imageUrl)).status, 404)
})
