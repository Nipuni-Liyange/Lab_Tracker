const express = require('express')
const path = require('node:path')
const fs = require('node:fs')
const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')
const User = require('./models/User')
const Session = require('./models/Session')
const { publicUser, createSession, revokeSession, requireAuth, requireRole, rateLimit } = require('./auth')

if (require.main === module) {
  const envPath = path.join(__dirname, '.env')
  if (fs.existsSync(envPath)) process.loadEnvFile(envPath)
}

const app = express()
const PORT = process.env.PORT || 5000

app.use(express.json({ limit: '16kb' }))
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store')
  if (req.method === 'POST') {
    // Browser forms cannot submit JSON; cross-origin JSON requests need CORS,
    // which this same-origin API deliberately does not enable.
    if (!req.is('application/json')) {
      return res.status(415).json({ message: 'Requests must use JSON.' })
    }
    const origin = req.get('origin')
    const allowedOrigins = process.env.CLIENT_ORIGIN
      ? [process.env.CLIENT_ORIGIN]
      : [
          `${req.protocol}://${req.get('host')}`,
          ...(process.env.NODE_ENV === 'production'
            ? [] : ['http://localhost:5173', 'http://127.0.0.1:5173'])
        ]
    if (origin && !allowedOrigins.includes(origin)) {
      return res.status(403).json({ message: 'Request origin is not allowed.' })
    }
  }
  next()
})

app.get('/api/health', (req, res) => {
  const connected = mongoose.connection.readyState === 1
  res.status(connected ? 200 : 503).json({
    message: connected ? 'Lab Track backend is running' : 'MongoDB is not connected',
    database: connected ? 'connected' : 'disconnected'
  })
})

app.post('/api/auth/register', rateLimit(), async (req, res) => {
  const { name, email, password, registrationNumber, adminCode, role = 'student' } = req.body || {}

  if (typeof email !== 'string' || typeof password !== 'string' ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || email.length > 254 ||
      password.length < 8 || Buffer.byteLength(password, 'utf8') > 72) {
    return res.status(400).json({
      message: 'Enter a valid email and a password of at least 8 characters (maximum 72 UTF-8 bytes).'
    })
  }

  if (typeof name !== 'string' || !name.trim() || name.trim().length > 100) {
    return res.status(400).json({ message: 'Enter a name of 1 to 100 characters.' })
  }

  if (!['student', 'admin'].includes(role)) {
    return res.status(400).json({ message: 'Choose student or admin.' })
  }

  if (role === 'student' && (typeof registrationNumber !== 'string' ||
      !registrationNumber.trim() || registrationNumber.trim().length > 50)) {
    return res.status(400).json({ message: 'Enter a registration number of 1 to 50 characters.' })
  }

  if (role === 'admin') {
    if (!process.env.ADMIN_REGISTRATION_CODE) {
      return res.status(503).json({ message: 'Admin registration is not configured on the server.' })
    }
    if (typeof adminCode !== 'string' || adminCode !== process.env.ADMIN_REGISTRATION_CODE) {
      return res.status(403).json({ message: 'Invalid admin code.' })
    }
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12)
    const user = await User.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      passwordHash,
      role,
      ...(role === 'student' ? { registrationNumber: registrationNumber.trim().toLowerCase() } : {})
    })

    res.status(201).json({
      message: 'Registration successful',
      user: publicUser(user)
    })
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        message: error.keyPattern?.registrationNumber
          ? 'Registration number already registered'
          : 'Email already registered'
      })
    }

    console.error(error)
    res.status(500).json({ message: 'Registration failed' })
  }
})

app.post('/api/auth/login', rateLimit(), async (req, res) => {
  const { email, password, role } = req.body || {}

  if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password ||
      email.length > 254 || Buffer.byteLength(password, 'utf8') > 72) {
    return res.status(400).json({ message: 'Enter a valid email and password.' })
  }

  if (role !== undefined && !['student', 'admin'].includes(role)) {
    return res.status(400).json({ message: 'Choose student or admin.' })
  }

  try {
    const user = await User.findOne({ email: email.trim().toLowerCase() })
    const passwordMatches = user
      ? await bcrypt.compare(password, user.passwordHash)
      : false

    if (!passwordMatches) {
      return res.status(401).json({ message: 'Invalid email or password' })
    }

    if (role && user.role !== role) {
      return res.status(403).json({ message: `This account is not registered as ${role}.` })
    }

    const expiresAt = await createSession(req, res, user)
    res.json({
      message: 'Login successful',
      user: publicUser(user),
      expiresAt
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Login failed' })
  }
})

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user), expiresAt: req.sessionExpiresAt })
})

app.get('/api/admin/profile', requireAuth, requireRole('admin'), (req, res) => {
  res.json({ user: publicUser(req.user) })
})

app.post('/api/auth/logout', async (req, res, next) => {
  try {
    await revokeSession(req, res)
    res.json({ message: 'You have been logged out.' })
  } catch (error) {
    next(error)
  }
})

app.use('/api', (req, res) => {
  res.status(404).json({ message: 'API endpoint not found.' })
})

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error)
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'Invalid JSON request.' })
  }
  if (error.type === 'entity.too.large') {
    return res.status(413).json({ message: 'Request is too large.' })
  }
  console.error(error)
  res.status(503).json({ message: 'The server is unavailable. Please try again.' })
})

async function startServer() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/lab_tracker', {
      serverSelectionTimeoutMS: 5000
    })
    await Promise.all([User.init(), Session.init()])
    console.log('Connected to MongoDB')

    app.listen(PORT, () => {
      console.log(`Backend running at http://localhost:${PORT}`)
    })
  } catch (error) {
    console.error('MongoDB connection failed:', error)
    await mongoose.disconnect()
    process.exitCode = 1
  }
}

if (require.main === module) {
  startServer()
}

module.exports = app
