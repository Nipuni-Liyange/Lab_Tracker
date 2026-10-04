const { before, after, test } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { once } = require('node:events')
const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')
const app = require('../index')
const User = require('../models/User')
const Session = require('../models/Session')
const Equipment = require('../models/Equipment')
const { seedSamples } = require('../sample-equipment')
const databaseName = `lab_tracker_test_${randomUUID().replaceAll('-', '')}`
let server, baseUrl, adminCookie, studentCookie, otherCookie, student, admin
const password = 'Test-Lab-Password-2026!'

async function request(path, cookie, body, method = 'POST') {
  const response = await fetch(`${baseUrl}/api${path}`, {
    method: body === undefined ? 'GET' : method,
    headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  })
  return { status: response.status, data: await response.json(), cookie: response.headers.getSetCookie().at(-1)?.split(';')[0] }
}
const fields = code => ({ name: `Test ${code}`, assetCode: code, category: 'Electronics', location: 'Test Lab', description: 'A test asset', instructions: 'Test instructions' })
async function asset(code) {
  const result = await request('/lab/equipment', adminCookie, fields(code))
  assert.equal(result.status, 201, JSON.stringify(result.data))
  return result.data.equipment
}
function slot(equipmentId, hours = 24) {
  return { equipmentId, start: new Date(Date.now() + hours * 3600000).toISOString(), end: new Date(Date.now() + (hours + 1) * 3600000).toISOString(), purpose: 'Course practical' }
}
const act = (bookingId, action, cookie = adminCookie, note = '') => request(`/lab/bookings/${bookingId}/action`, cookie, { action, note })

before(async () => {
  await mongoose.connect(`mongodb://127.0.0.1:27017/${databaseName}`, { serverSelectionTimeoutMS: 5000 })
  await Promise.all([User.init(), Session.init(), Equipment.init()])
  const passwordHash = await bcrypt.hash(password, 12)
  admin = await User.create({ name: 'Admin', email: 'admin@lab.test', role: 'admin', passwordHash })
  student = await User.create({ name: 'Student One', email: 'one@lab.test', role: 'student', registrationNumber: 'test-one', passwordHash })
  await User.create({ name: 'Student Two', email: 'two@lab.test', role: 'student', registrationNumber: 'test-two', passwordHash })
  server = app.listen(0, '127.0.0.1'); await once(server, 'listening')
  baseUrl = `http://127.0.0.1:${server.address().port}`
  adminCookie = (await request('/auth/login', null, { email: admin.email, password })).cookie
  studentCookie = (await request('/auth/login', null, { email: student.email, password })).cookie
  otherCookie = (await request('/auth/login', null, { email: 'two@lab.test', password })).cookie
})
after(async () => {
  if (server) await new Promise(resolve => server.close(resolve))
  if (mongoose.connection.name === databaseName) await mongoose.connection.dropDatabase()
  await mongoose.disconnect()
})

test('lab endpoints require login and admin mutations reject students', async () => {
  assert.equal((await request('/lab/equipment')).status, 401)
  assert.equal((await request('/lab/equipment', studentCookie, fields('UNAUTH'))).status, 403)
  assert.equal((await request('/lab/members', studentCookie)).status, 403)
  const members = await request('/lab/members', adminCookie)
  assert.equal(members.status, 200)
  assert.equal(members.data.members.length, 3)
  assert.equal(members.data.members[0].passwordHash, undefined)
})

test('inventory validates input, unique asset codes, and concurrent edits', async () => {
  assert.equal((await request('/lab/equipment', adminCookie, { ...fields('BAD'), name: '' })).status, 400)
  const item = await asset('ASSET-01')
  assert.equal((await request('/lab/equipment', adminCookie, fields('asset-01'))).status, 409)
  assert.equal((await request(`/lab/equipment/${item._id}`, adminCookie, { ...item, name: 'Updated', status: 'available' }, 'PATCH')).status, 200)
  assert.equal((await request(`/lab/equipment/${item._id}`, adminCookie, { ...item, name: 'Stale' }, 'PATCH')).status, 409)
  assert.equal((await request('/lab/equipment/not-an-id', adminCookie, item, 'PATCH')).status, 400)
})

test('requests validate dates and enforce ownership without leaking others bookings', async () => {
  const item = await asset('PRIVACY')
  for (const invalid of [{ ...slot(item._id), start: 'bad' }, { ...slot(item._id), start: new Date(Date.now() - 1000).toISOString() }, { ...slot(item._id), end: new Date(Date.now() + 48 * 3600000).toISOString() }, { ...slot(item._id), purpose: '' }]) {
    assert.equal((await request('/lab/bookings', studentCookie, invalid)).status, 400)
  }
  const booking = await request('/lab/bookings', studentCookie, slot(item._id))
  assert.equal(booking.status, 201)
  assert.equal((await request('/lab/bookings', studentCookie, slot(item._id))).status, 409)
  assert.equal((await request('/lab/bookings', adminCookie, slot(item._id))).status, 403)
  assert.equal((await request('/lab/bookings', otherCookie)).data.bookings.length, 0)
  assert.equal((await act(booking.data.bookingId, 'cancel', otherCookie)).status, 404)
  assert.equal((await act(booking.data.bookingId, 'approve', studentCookie)).status, 403)
  assert.equal((await act(booking.data.bookingId, 'cancel', studentCookie)).status, 200)
})

test('simultaneous overlapping approvals cannot double-book equipment', async () => {
  const item = await asset('RACE')
  const times = slot(item._id)
  const a = await request('/lab/bookings', studentCookie, times)
  const b = await request('/lab/bookings', otherCookie, times)
  const results = await Promise.all([act(a.data.bookingId, 'approve'), act(b.data.bookingId, 'approve')])
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409])
  const stored = await Equipment.findById(item._id)
  assert.equal(stored.bookings.filter(b => b.status === 'approved').length, 1)
  assert.equal(stored.bookings.filter(b => b.status === 'pending').length, 1)
  const equipment = (await request('/lab/equipment', otherCookie)).data.equipment.find(e => e._id === item._id)
  assert.equal(equipment.bookings, undefined)
  assert.equal(equipment.schedule.length, 1)
  assert.equal(equipment.schedule[0].user, undefined)
  assert.equal((await request('/lab/bookings', studentCookie, times)).status, 409)
  const approved = stored.bookings.find(b => b.status === 'approved')
  assert.equal((await act(approved.id, 'cancel')).status, 200)
  const pending = stored.bookings.find(b => b.status === 'pending')
  assert.equal((await act(pending.id, 'approve')).status, 200)
  // Adjacent slots are valid: end == next start is not an overlap.
  const adjacent = await request('/lab/bookings', studentCookie, { ...times, start: times.end, end: new Date(+new Date(times.end) + 3600000).toISOString() })
  assert.equal(adjacent.status, 201)
  assert.equal((await act(adjacent.data.bookingId, 'approve')).status, 200)
})

test('maintenance and archive preserve bookings and require active bookings to be resolved', async () => {
  const item = await asset('MAINT')
  const booking = await request('/lab/bookings', studentCookie, slot(item._id))
  let current = (await request('/lab/equipment', adminCookie)).data.equipment.find(e => e._id === item._id)
  assert.equal((await request(`/lab/equipment/${item._id}`, adminCookie, { ...current, status: 'archived' }, 'PATCH')).status, 409)
  assert.equal((await act(booking.data.bookingId, 'approve')).status, 200)
  current = (await request('/lab/equipment', adminCookie)).data.equipment.find(e => e._id === item._id)
  assert.equal((await request(`/lab/equipment/${item._id}`, adminCookie, { ...current, status: 'maintenance' }, 'PATCH')).status, 409)
  assert.equal((await act(booking.data.bookingId, 'cancel')).status, 200)
  current = (await request('/lab/equipment', adminCookie)).data.equipment.find(e => e._id === item._id)
  assert.equal((await request(`/lab/equipment/${item._id}`, adminCookie, { ...current, status: 'maintenance' }, 'PATCH')).status, 200)
  assert.equal((await request('/lab/bookings', studentCookie, slot(item._id))).status, 409)
  current = (await request('/lab/equipment', adminCookie)).data.equipment.find(e => e._id === item._id)
  assert.equal((await request(`/lab/equipment/${item._id}`, adminCookie, { ...current, status: 'archived' }, 'PATCH')).status, 200)
  assert.ok(!(await request('/lab/equipment', studentCookie)).data.equipment.some(e => e._id === item._id))
  assert.ok((await request('/lab/bookings', studentCookie)).data.bookings.some(b => b._id === booking.data.bookingId))
})

test('rejection needs a reason and terminal states cannot be approved again', async () => {
  const item = await asset('REJECT')
  const booking = await request('/lab/bookings', studentCookie, slot(item._id))
  assert.equal((await act(booking.data.bookingId, 'reject')).status, 400)
  assert.equal((await act(booking.data.bookingId, 'reject', adminCookie, 'Requires supervisor training')).status, 200)
  assert.equal((await act(booking.data.bookingId, 'approve')).status, 409)
  const saved = (await request('/lab/bookings', studentCookie)).data.bookings.find(b => b._id === booking.data.bookingId)
  assert.equal(saved.note, 'Requires supervisor training')
})

test('checkout and return enforce lifecycle and overdue items cannot be promised again', async () => {
  const item = await asset('RETURN')
  const booking = await request('/lab/bookings', studentCookie, slot(item._id))
  assert.equal((await act(booking.data.bookingId, 'return')).status, 409)
  assert.equal((await act(booking.data.bookingId, 'approve')).status, 200)
  assert.equal((await act(booking.data.bookingId, 'checkout')).status, 409)
  await Equipment.updateOne({ _id: item._id, 'bookings._id': booking.data.bookingId }, { $set: { 'bookings.$.start': new Date(Date.now() - 3600000), 'bookings.$.end': new Date(Date.now() + 3600000) } })
  assert.equal((await act(booking.data.bookingId, 'checkout')).status, 200)
  assert.equal((await act(booking.data.bookingId, 'cancel', studentCookie)).status, 409)
  await Equipment.updateOne({ _id: item._id, 'bookings._id': booking.data.bookingId }, { $set: { 'bookings.$.end': new Date(Date.now() - 1000) } })
  assert.equal((await request('/lab/bookings', otherCookie, slot(item._id, 48))).status, 409)
  assert.ok((await request('/lab/bookings', adminCookie)).data.bookings.find(b => b._id === booking.data.bookingId).overdue)
  assert.equal((await act(booking.data.bookingId, 'return')).status, 200)
  assert.equal((await request('/lab/bookings', otherCookie, slot(item._id, 48))).status, 201)
})

test('profile edits cannot change role, and password changes revoke sessions', async () => {
  const result = await request('/lab/profile', studentCookie, { name: 'Updated Student', registrationNumber: 'test-one', role: 'admin' }, 'PATCH')
  assert.equal(result.status, 200)
  assert.equal(result.data.user.role, 'student')
  assert.equal((await request('/lab/profile', studentCookie, { name: 'Updated Student', registrationNumber: 'test-two' }, 'PATCH')).status, 409)
  assert.equal((await request('/lab/password', studentCookie, { currentPassword: 'wrong', newPassword: 'New-Password-Example' })).status, 400)
  assert.equal((await request('/lab/password', studentCookie, { currentPassword: password, newPassword: 'New-Password-Example' })).status, 200)
  assert.equal((await request('/auth/me', studentCookie)).status, 401)
  assert.equal((await request('/auth/login', null, { email: student.email, password: 'New-Password-Example' })).status, 200)
})

test('sample import is repeatable and does not overwrite equipment', async () => {
  await seedSamples()
  await Equipment.updateOne({ assetCode: 'SAMPLE-MIC-01' }, { name: 'Edited sample name' })
  await seedSamples()
  assert.equal(await Equipment.countDocuments({ sample: true }), 6)
  assert.equal((await Equipment.findOne({ assetCode: 'SAMPLE-MIC-01' })).name, 'Edited sample name')
})

test('cross-origin PATCH requests cannot edit equipment', async () => {
  const response = await fetch(`${baseUrl}/api/lab/profile`, { method: 'PATCH', headers: { Cookie: adminCookie, 'Content-Type': 'application/json', Origin: 'https://untrusted.example' }, body: JSON.stringify({ name: 'Injected' }) })
  assert.equal(response.status, 403)
})
