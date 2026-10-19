const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { once } = require('node:events')
const { before, after, test } = require('node:test')
const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')
const app = require('../index')
const User = require('../models/User')
const Session = require('../models/Session')
const { createHash } = require('node:crypto')
const { rateLimit } = require('../auth')

const databaseName = `lab_tracker_test_${randomUUID().replaceAll('-', '')}`
const originalAdminCode = process.env.ADMIN_REGISTRATION_CODE
let server
let baseUrl

before(async () => {
  await mongoose.connect(process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27017', {
    dbName: databaseName,
    serverSelectionTimeoutMS: 5000
  })
  await Promise.all([User.init(), Session.init()])
  server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  if (originalAdminCode === undefined) delete process.env.ADMIN_REGISTRATION_CODE
  else process.env.ADMIN_REGISTRATION_CODE = originalAdminCode
  if (server) await new Promise((resolve) => server.close(resolve))
  if (mongoose.connection.readyState === 1 && mongoose.connection.name === databaseName) {
    await mongoose.connection.dropDatabase()
  }
  await mongoose.disconnect()
})

async function post(path, body, headers = {}) {
  const response = await fetch(`${baseUrl}/api/auth/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body)
  })
  return {
    status: response.status,
    data: await response.json(),
    cookie: response.headers.getSetCookie().at(-1)?.split(';')[0],
    setCookie: response.headers.getSetCookie().at(-1)
  }
}

async function get(path, cookie) {
  const response = await fetch(`${baseUrl}${path}`, { headers: cookie ? { Cookie: cookie } : {} })
  return { status: response.status, data: await response.json() }
}

async function loginStudent(headers) {
  return post('login', { email: student.email, password: student.password, role: 'student' }, headers)
}

const student = {
  name: ' Test Student ',
  email: ' Student@Example.com ',
  password: 'test-password-123',
  role: 'student',
  registrationNumber: ' EG-TEST-001 '
}

test('health reports the live database connection', async () => {
  const response = await fetch(`${baseUrl}/api/health`)
  assert.equal(response.status, 200)
  assert.equal((await response.json()).database, 'connected')
})

test('registration persists student details and a hashed password, then allows login', async () => {
  const result = await post('register', student)
  assert.equal(result.status, 201)
  assert.equal(result.data.user.role, 'student')
  assert.equal(result.data.user.passwordHash, undefined)
  const saved = await User.findById(result.data.user.id).lean()
  assert.equal(saved.name, 'Test Student')
  assert.equal(saved.email, 'student@example.com')
  assert.equal(saved.registrationNumber, 'eg-test-001')
  assert.notEqual(saved.passwordHash, student.password)
  assert.equal(await bcrypt.compare(student.password, saved.passwordHash), true)
  const login = await post('login', { email: student.email, password: student.password })
  assert.equal(login.status, 200)
  assert.equal(login.data.user.id, result.data.user.id)
  assert.equal(login.data.user.passwordHash, undefined)
})

test('duplicate email and registration number return useful conflicts', async () => {
  const email = await post('register', { ...student, registrationNumber: 'another-number' })
  assert.equal(email.status, 409)
  assert.match(email.data.message, /Email already/)
  const number = await post('register', { ...student, email: 'another@example.com' })
  assert.equal(number.status, 409)
  assert.match(number.data.message, /Registration number already/)
})

test('invalid registration fields do not create users', async () => {
  const count = await User.countDocuments()
  for (const change of [
    { name: ' ' }, { email: 'invalid' }, { password: 'short' },
    { registrationNumber: ' ' }, { role: 'superadmin' }, { email: {} }
  ]) {
    assert.equal((await post('register', { ...student, ...change })).status, 400)
  }
  assert.equal((await post('register', {})).status, 400)
  assert.equal(await User.countDocuments(), count)
})

test('admin registration requires a configured and matching code', async () => {
  const admin = { name: 'Admin', email: 'admin@example.com', password: student.password, role: 'admin' }
  delete process.env.ADMIN_REGISTRATION_CODE
  assert.equal((await post('register', admin)).status, 503)
  process.env.ADMIN_REGISTRATION_CODE = randomUUID()
  assert.equal((await post('register', admin)).status, 403)
  assert.equal((await post('register', { ...admin, adminCode: 'wrong' })).status, 403)
  assert.equal(await User.countDocuments({ role: 'admin' }), 0)
  const result = await post('register', { ...admin, adminCode: process.env.ADMIN_REGISTRATION_CODE })
  assert.equal(result.status, 201)
  const saved = await User.findById(result.data.user.id).lean()
  assert.equal(saved.role, 'admin')
  assert.equal(saved.adminCode, undefined)
  assert.equal(saved.registrationNumber, undefined)
  const login = await post('login', { email: admin.email, password: admin.password })
  assert.equal(login.status, 200)
  assert.equal(login.data.user.role, 'admin')
  // Optional registration numbers must not cause a uniqueness conflict for admins.
  assert.equal((await post('register', {
    ...admin, email: 'admin2@example.com', adminCode: process.env.ADMIN_REGISTRATION_CODE
  })).status, 201)
})

test('incorrect passwords, unknown users, and malformed credentials are rejected', async () => {
  assert.equal((await post('login', { email: student.email, password: 'incorrect' })).status, 401)
  assert.equal((await post('login', { email: 'missing@example.com', password: student.password })).status, 401)
  assert.equal((await post('login', { email: {}, password: student.password })).status, 400)
  assert.equal((await post('login', {})).status, 400)
})

test('existing email/password-only accounts still log in', async () => {
  await User.collection.insertOne({
    email: 'legacy@example.com',
    passwordHash: await bcrypt.hash(student.password, 12)
  })
  const result = await post('login', { email: 'legacy@example.com', password: student.password })
  assert.equal(result.status, 200)
  assert.equal(result.data.user.role, 'student')
})

test('login creates an HttpOnly session that restores the full account profile', async () => {
  const login = await loginStudent()
  assert.equal(login.status, 200)
  assert.match(login.setCookie, /HttpOnly/)
  assert.match(login.setCookie, /SameSite=Strict/)
  assert.match(login.setCookie, /Max-Age=604800/)
  assert.ok(new Date(login.data.expiresAt) > new Date())
  const token = login.cookie.split('=')[1]
  const tokenHash = createHash('sha256').update(token).digest('hex')
  const stored = await Session.findOne({ tokenHash }).lean()
  assert.ok(stored)
  assert.notEqual(stored.tokenHash, token)
  const me = await get('/api/auth/me', login.cookie)
  assert.equal(me.status, 200)
  assert.equal(me.data.user.name, 'Test Student')
  assert.equal(me.data.user.registrationNumber, 'eg-test-001')
  assert.equal(me.data.user.passwordHash, undefined)
})

test('anonymous and forged sessions cannot access protected routes', async () => {
  for (const cookie of [undefined, 'lab_track_session=bad-token', `lab_track_session=${'0'.repeat(64)}`]) {
    assert.equal((await get('/api/auth/me', cookie)).status, 401)
    assert.equal((await get('/api/admin/profile', cookie)).status, 401)
  }
})

test('the backend enforces the selected login role and admin access', async () => {
  const count = await Session.countDocuments()
  const mismatch = await post('login', { email: student.email, password: student.password, role: 'admin' })
  assert.equal(mismatch.status, 403)
  assert.equal(mismatch.cookie, undefined)
  assert.equal(await Session.countDocuments(), count)
  const studentLogin = await loginStudent()
  assert.equal((await get('/api/admin/profile', studentLogin.cookie)).status, 403)
  const adminLogin = await post('login', { email: 'admin@example.com', password: student.password, role: 'admin' })
  assert.equal((await get('/api/admin/profile', adminLogin.cookie)).status, 200)
  // A role change takes effect immediately; the cookie does not grant a fixed role.
  await User.updateOne({ email: 'admin@example.com' }, { role: 'student' })
  assert.equal((await get('/api/admin/profile', adminLogin.cookie)).status, 403)
  await User.updateOne({ email: 'admin@example.com' }, { role: 'admin' })
})

test('logout revokes the server session and is safe to repeat', async () => {
  const login = await loginStudent()
  const logout = await post('logout', {}, { Cookie: login.cookie })
  assert.equal(logout.status, 200)
  assert.match(logout.setCookie, /Expires=Thu, 01 Jan 1970/)
  assert.equal((await get('/api/auth/me', login.cookie)).status, 401)
  assert.equal((await post('logout', {})).status, 200)
})

test('signing in again rotates the current browser session', async () => {
  const first = await loginStudent()
  const second = await loginStudent({ Cookie: first.cookie })
  assert.notEqual(first.cookie, second.cookie)
  assert.equal((await get('/api/auth/me', first.cookie)).status, 401)
  assert.equal((await get('/api/auth/me', second.cookie)).status, 200)
})

test('expired sessions are rejected before MongoDB TTL cleanup', async () => {
  const login = await loginStudent()
  const tokenHash = createHash('sha256').update(login.cookie.split('=')[1]).digest('hex')
  await Session.updateOne({ tokenHash }, { expiresAt: new Date(Date.now() - 1000) })
  assert.equal((await get('/api/auth/me', login.cookie)).status, 401)
})

test('sessions for deleted users are rejected', async () => {
  const login = await post('login', { email: 'admin2@example.com', password: student.password })
  assert.equal(login.status, 200)
  await User.deleteOne({ email: 'admin2@example.com' })
  assert.equal((await get('/api/auth/me', login.cookie)).status, 401)
})

test('sessions survive reopening the HTTP server and database connection', async () => {
  const login = await loginStudent()
  await new Promise(resolve => server.close(resolve))
  await mongoose.disconnect()
  await mongoose.connect(process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27017', { dbName: databaseName })
  server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  baseUrl = `http://127.0.0.1:${server.address().port}`
  assert.equal((await get('/api/auth/me', login.cookie)).status, 200)
})

test('cross-origin and non-JSON mutations are rejected', async () => {
  const response = await post('login', { email: student.email, password: student.password }, { Origin: 'https://untrusted.example' })
  assert.equal(response.status, 403)
  assert.equal((await post('logout', {}, { Origin: 'https://untrusted.example' })).status, 403)
  const form = await fetch(`${baseUrl}/api/auth/logout`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: ''
  })
  assert.equal(form.status, 415)
  const sameOrigin = await loginStudent({ Origin: baseUrl })
  assert.equal(sameOrigin.status, 200)
  const viteOrigin = await loginStudent({ Origin: 'http://localhost:5173' })
  assert.equal(viteOrigin.status, 200)
})

test('malformed JSON and oversized passwords have useful errors', async () => {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{'
  })
  assert.equal(response.status, 400)
  assert.equal((await response.json()).message, 'Invalid JSON request.')
  assert.equal((await post('register', { ...student, password: 'a'.repeat(73) })).status, 400)
  assert.equal((await post('register', { ...student, password: '😀'.repeat(20) })).status, 400)
})

test('attempt limiting returns 429 and a retry time', () => {
  const limit = rateLimit({ max: 2 })
  let passed = 0
  const result = {}
  const res = {
    set(key, value) { result[key] = value; return this },
    status(value) { result.status = value; return this },
    json(value) { result.body = value }
  }
  for (let index = 0; index < 3; index += 1) limit({ ip: 'test-client' }, res, () => { passed += 1 })
  assert.equal(passed, 2)
  assert.equal(result.status, 429)
  assert.ok(Number(result['Retry-After']) > 0)
})
