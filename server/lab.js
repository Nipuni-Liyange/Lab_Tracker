const express = require('express')
const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')
const Equipment = require('./models/Equipment')
const User = require('./models/User')
const Session = require('./models/Session')
const { requireAuth, requireRole, publicUser, revokeSession, rateLimit } = require('./auth')
const router = express.Router()
router.use(requireAuth)

function fail(message, status = 400) { const error = new Error(message); error.status = status; throw error }
function id(value) { if (!mongoose.isObjectIdOrHexString(value)) fail('Invalid record ID.'); return value }
function text(value, label, max, required = true) {
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) fail(`${label} must be ${required ? '1' : '0'}–${max} characters.`)
  return value.trim()
}
function equipmentFields(body) {
  return {
    name: text(body.name, 'Name', 120), assetCode: text(body.assetCode, 'Asset code', 50).toUpperCase(),
    category: text(body.category, 'Category', 60), location: text(body.location, 'Location', 120),
    description: text(body.description ?? '', 'Description', 2000, false),
    instructions: text(body.instructions ?? '', 'Instructions', 2000, false)
  }
}
function equipmentView(item, admin) {
  const { bookings, ...rest } = item
  const now = new Date()
  const inUse = bookings.some(b => b.status === 'in_use')
  const reserved = bookings.some(b => b.status === 'approved' && b.start <= now && b.end > now)
  return {
    ...rest, availability: item.status !== 'available' ? item.status : inUse ? 'in_use' : reserved ? 'reserved' : 'available',
    schedule: bookings.filter(b => ['approved', 'in_use'].includes(b.status) && (b.end > now || b.status === 'in_use'))
      .map(b => ({ start: b.start, end: b.end, status: b.status })),
    ...(admin ? { pendingCount: bookings.filter(b => b.status === 'pending').length } : {})
  }
}
function noConflict(start, end) {
  return { $not: { $elemMatch: { $or: [
    { status: 'approved', start: { $lt: end }, end: { $gt: start } },
    { status: 'in_use', $or: [{ start: { $lt: end }, end: { $gt: start } }, { end: { $lte: new Date() } }] }
  ] } } }
}

router.get('/equipment', async (req, res) => {
  const admin = req.user.role === 'admin'
  const items = await Equipment.find(admin ? {} : { status: { $ne: 'archived' } }).sort({ name: 1 }).lean()
  res.json({ equipment: items.map(item => equipmentView(item, admin)) })
})

router.post('/equipment', requireRole('admin'), async (req, res) => {
  const equipment = await Equipment.create(equipmentFields(req.body || {}))
  res.status(201).json({ equipment: equipmentView(equipment.toObject(), true) })
})

router.patch('/equipment/:id', requireRole('admin'), async (req, res) => {
  const body = req.body || {}
  if (!Number.isInteger(body.revision)) fail('Reload the equipment before saving.')
  const fields = equipmentFields(body)
  if (!['available', 'maintenance', 'archived'].includes(body.status)) fail('Choose a valid equipment status.')
  fields.status = body.status
  const query = { _id: id(req.params.id), revision: body.revision }
  if (body.status !== 'available') {
    query.bookings = { $not: { $elemMatch: { $or: [
      { status: 'in_use' }, { status: 'approved', end: { $gt: new Date() } },
      ...(body.status === 'archived' ? [{ status: 'pending' }] : [])
    ] } } }
  }
  const updated = await Equipment.findOneAndUpdate(query, { $set: fields, $inc: { revision: 1 } }, { returnDocument: 'after', runValidators: true }).lean()
  if (!updated) fail('Equipment changed or has active bookings. Refresh, and resolve bookings before maintenance or archiving.', 409)
  res.json({ equipment: equipmentView(updated, true) })
})

router.get('/bookings', async (req, res) => {
  const admin = req.user.role === 'admin'
  const items = await Equipment.find(admin ? {} : { 'bookings.user': req.user._id }).lean()
  const bookings = items.flatMap(item => item.bookings
    .filter(b => admin || String(b.user) === req.user.id)
    .map(b => ({ ...b, equipment: { _id: item._id, name: item.name, assetCode: item.assetCode, location: item.location, category: item.category },
      overdue: b.status === 'in_use' && b.end < new Date() })))
  const users = await User.find({ _id: { $in: [...new Set(bookings.map(b => String(b.user)))] } }).select('name email registrationNumber role').lean()
  const userMap = new Map(users.map(u => [String(u._id), u]))
  res.json({ bookings: bookings.map(b => ({ ...b, user: userMap.get(String(b.user)) || { name: 'Removed account' } }))
    .sort((a, b) => b.createdAt - a.createdAt) })
})

router.post('/bookings', requireRole('student'), async (req, res) => {
  const body = req.body || {}
  const start = typeof body.start === 'string' ? new Date(body.start) : new Date(NaN)
  const end = typeof body.end === 'string' ? new Date(body.end) : new Date(NaN)
  const now = Date.now()
  if (!Number.isFinite(+start) || !Number.isFinite(+end) || +start < now || +end <= +start ||
      +end - +start > 8 * 60 * 60 * 1000 || +start > now + 90 * 86400000) {
    fail('Choose a future slot within 90 days, lasting no more than 8 hours.')
  }
  const purpose = text(body.purpose, 'Purpose', 1000)
  const bookingId = new mongoose.Types.ObjectId()
  const item = await Equipment.findOneAndUpdate({
    _id: id(body.equipmentId), status: 'available',
    $and: [
      { bookings: noConflict(start, end) },
      { bookings: { $not: { $elemMatch: { user: req.user._id, status: 'pending', start: { $lt: end }, end: { $gt: start } } } } }
    ]
  }, { $push: { bookings: { _id: bookingId, user: req.user._id, start, end, purpose, status: 'pending', createdAt: new Date(), updatedAt: new Date() } },
    $inc: { revision: 1 } }, { returnDocument: 'after', runValidators: true }).lean()
  if (!item) fail('This item is unavailable, the time is reserved, or you already have an overlapping request.', 409)
  res.status(201).json({ message: 'Booking request sent for approval.', bookingId })
})

router.post('/bookings/:id/action', async (req, res) => {
  const bookingId = id(req.params.id)
  const { action, note = '' } = req.body || {}
  const admin = req.user.role === 'admin'
  if (!['approve', 'reject', 'cancel', 'checkout', 'return'].includes(action)) fail('Unknown booking action.')
  if (action !== 'cancel' && !admin) fail('Administrator access required.', 403)
  const item = await Equipment.findOne({ 'bookings._id': bookingId }).lean()
  if (!item) fail('Booking not found.', 404)
  const booking = item.bookings.find(b => String(b._id) === bookingId)
  if (!admin && String(booking.user) !== req.user.id) fail('Booking not found.', 404)
  const allowed = { approve: ['pending'], reject: ['pending'], cancel: ['pending', 'approved'], checkout: ['approved'], return: ['in_use'] }
  if (!allowed[action].includes(booking.status)) fail('This booking no longer allows that action. Refresh the list.', 409)
  const statuses = { approve: 'approved', reject: 'rejected', cancel: 'cancelled', checkout: 'in_use', return: 'completed' }
  const query = { _id: item._id, bookings: { $elemMatch: { _id: new mongoose.Types.ObjectId(bookingId), status: booking.status } } }
  if (action === 'approve') {
    if (booking.start <= new Date()) fail('The requested start time has passed. Reject this request and ask for a new slot.', 409)
    query.status = 'available'
    query.$and = [{ bookings: noConflict(booking.start, booking.end) }]
  }
  if (action === 'checkout') {
    if (booking.start > new Date() || booking.end <= new Date()) fail('Check out during the approved booking time.', 409)
    query.status = 'available'
    query.$and = [{ bookings: { $not: { $elemMatch: { status: 'in_use' } } } }]
  }
  const update = { 'bookings.$.status': statuses[action], 'bookings.$.updatedAt': new Date() }
  if (['reject', 'cancel'].includes(action)) update['bookings.$.note'] = text(note, 'Reason', 1000, action === 'reject')
  if (action === 'approve' || action === 'reject') update['bookings.$.reviewedBy'] = req.user._id
  if (action === 'checkout') update['bookings.$.checkedOutAt'] = new Date()
  if (action === 'return') update['bookings.$.returnedAt'] = new Date()
  const updated = await Equipment.updateOne(query, { $set: update, $inc: { revision: 1 } }, { runValidators: true })
  if (!updated.modifiedCount) fail('The schedule changed or equipment is unavailable. Refresh and try again.', 409)
  res.json({ message: `Booking ${statuses[action].replace('_', ' ')}.` })
})

router.get('/members', requireRole('admin'), async (req, res) => {
  const users = await User.find().select('name email registrationNumber role').sort({ name: 1 }).lean()
  res.json({ members: users })
})

router.patch('/profile', async (req, res) => {
  const update = { name: text(req.body?.name, 'Name', 100) }
  if (req.user.role === 'student') update.registrationNumber = text(req.body?.registrationNumber, 'Registration number', 50).toLowerCase()
  const user = await User.findByIdAndUpdate(req.user._id, { $set: update }, { returnDocument: 'after', runValidators: true })
  res.json({ user: publicUser(user) })
})

router.post('/password', rateLimit({ max: 10 }), async (req, res) => {
  const { currentPassword, newPassword } = req.body || {}
  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string' || newPassword.length < 8 || Buffer.byteLength(newPassword) > 72) fail('Use a new password of at least 8 characters and at most 72 UTF-8 bytes.')
  const user = await User.findById(req.user._id)
  if (!await bcrypt.compare(currentPassword, user.passwordHash)) fail('Current password is incorrect.', 400)
  const hash = await bcrypt.hash(newPassword, 12)
  const updated = await User.updateOne({ _id: user._id, passwordHash: user.passwordHash }, { $set: { passwordHash: hash } })
  if (!updated.modifiedCount) fail('Password changed in another session. Log in again.', 409)
  await Session.deleteMany({ user: user._id })
  await revokeSession(req, res)
  res.json({ message: 'Password updated. Please log in again on all devices.' })
})

router.use((error, req, res, next) => {
  if (error.code === 11000) return res.status(409).json({ message: 'That asset code or registration number already exists.' })
  if (error.status) return res.status(error.status).json({ message: error.message })
  if (error.name === 'ValidationError') return res.status(400).json({ message: 'Check the entered values and try again.' })
  next(error)
})
module.exports = router
