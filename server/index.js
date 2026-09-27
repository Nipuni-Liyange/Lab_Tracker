const express = require('express')
const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')
const User = require('./models/User')

const app = express()
const PORT = 5000

app.use(express.json())

app.get('/api/health', (req, res) => {
  res.json({ message: 'Lab Track backend is running' })
})

app.post('/api/auth/register', async (req, res) => {
  const { email, password } = req.body

  if (typeof email !== 'string' || typeof password !== 'string' ||
      !email.includes('@') || password.length < 8) {
    return res.status(400).json({
      message: 'Enter a valid email and a password of at least 8 characters.'
    })
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12)
    const user = await User.create({ email, passwordHash })

    res.status(201).json({
      message: 'Student registered successfully',
      user: { id: user.id, email: user.email }
    })
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'Email already registered' })
    }

    console.error(error)
    res.status(500).json({ message: 'Registration failed' })
  }
})

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body

  if (typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ message: 'Email and password are required' })
  }

  try {
    const user = await User.findOne({ email: email.trim().toLowerCase() })
    const passwordMatches = user
      ? await bcrypt.compare(password, user.passwordHash)
      : false

    if (!passwordMatches) {
      return res.status(401).json({ message: 'Invalid email or password' })
    }

    res.json({
  message: 'Login successful',
  user: {
    id: user.id,
    email: user.email,
    role: user.role || 'student'
  }
})
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Login failed' })
  }
})

async function startServer() {
  try {
    await mongoose.connect('mongodb://127.0.0.1:27017/lab_tracker')
    console.log('Connected to MongoDB')

    app.listen(PORT, () => {
      console.log(`Backend running at http://localhost:${PORT}`)
    })
  } catch (error) {
    console.error('MongoDB connection failed:', error)
  }
}

startServer()