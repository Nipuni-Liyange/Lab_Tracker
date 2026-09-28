const { randomBytes, createHash } = require('node:crypto')
const Session = require('./models/Session')

const COOKIE_NAME = 'lab_track_session'
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/'
  }
}

function getTokenHash(req) {
  const cookie = (req.headers.cookie || '').split(';')
    .map(part => part.trim()).find(part => part.startsWith(`${COOKIE_NAME}=`))
  const token = cookie?.slice(COOKIE_NAME.length + 1)
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null
  return createHash('sha256').update(token).digest('hex')
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name || '',
    email: user.email,
    registrationNumber: user.registrationNumber || '',
    role: user.role || 'student'
  }
}

async function revokeSession(req, res) {
  const tokenHash = getTokenHash(req)
  if (tokenHash) await Session.deleteOne({ tokenHash })
  res.clearCookie(COOKIE_NAME, cookieOptions())
}

async function createSession(req, res, user) {
  // Rotate any previous token instead of reusing a browser's existing session.
  await revokeSession(req, res)
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS)
  await Session.create({
    tokenHash: createHash('sha256').update(token).digest('hex'),
    user: user._id,
    expiresAt
  })
  res.cookie(COOKIE_NAME, token, { ...cookieOptions(), maxAge: SESSION_DURATION_MS })
  return expiresAt
}

async function requireAuth(req, res, next) {
  try {
    const tokenHash = getTokenHash(req)
    const session = tokenHash
      ? await Session.findOne({ tokenHash, expiresAt: { $gt: new Date() } })
        .populate('user', '-passwordHash')
      : null
    if (!session?.user) {
      res.clearCookie(COOKIE_NAME, cookieOptions())
      return res.status(401).json({ message: 'Your session has ended. Please log in again.' })
    }
    req.user = session.user
    req.sessionExpiresAt = session.expiresAt
    next()
  } catch (error) {
    next(error)
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (req.user?.role !== role) {
      return res.status(403).json({ message: 'You do not have access to this page.' })
    }
    next()
  }
}

// Separate, bounded limits for registration and login; reset when the server restarts.
function rateLimit({ max = 30, windowMs = 15 * 60 * 1000 } = {}) {
  const attempts = new Map()
  return (req, res, next) => {
    const now = Date.now()
    for (const [ip, entry] of attempts) {
      if (entry.expiresAt <= now) attempts.delete(ip)
    }
    const ip = req.ip
    const entry = attempts.get(ip) || { count: 0, expiresAt: now + windowMs }
    if (entry.count >= max || (!attempts.has(ip) && attempts.size >= 10000)) {
      res.set('Retry-After', String(Math.max(1, Math.ceil((entry.expiresAt - now) / 1000))))
      return res.status(429).json({ message: 'Too many attempts. Please try again in 15 minutes.' })
    }
    entry.count += 1
    attempts.set(ip, entry)
    next()
  }
}

module.exports = { publicUser, createSession, revokeSession, requireAuth, requireRole, rateLimit }
