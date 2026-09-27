import { useState } from 'react'
import './App.css'

function App() {
  const [isRegistering, setIsRegistering] = useState(false)
  const [selectedRole, setSelectedRole] = useState('student')
  const [registrationRole, setRegistrationRole] = useState('student')

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [registrationNumber, setRegistrationNumber] = useState('')
  const [adminCode, setAdminCode] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  function switchMode(registering) {
    setIsRegistering(registering)
    setPassword('')
    setMessage('')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setMessage('')

    if (isRegistering) {
      setMessage(
        'Registration fields are ready. The backend must be updated to save these details and check the admin code.'
      )
      return
    }

    setIsLoading(true)

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const data = await response.json()

      if (!response.ok) {
        setMessage(data.message || 'Login failed.')
        return
      }

      if (data.user?.role !== selectedRole) {
        setMessage(`This account is not registered as an ${selectedRole}.`)
        return
      }

      setMessage(
        `Login successful! You are signed in as ${selectedRole}.`
      )
      setPassword('')
    } catch {
      setMessage('Cannot connect to the backend. Check that it is running.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <main>
      <h1 className="brand-title">
        Lab <span>Track</span>
      </h1>

      <p className="brand-subtitle">
        University Lab Equipment Booking and Management System
      </p>

      <form onSubmit={handleSubmit}>
        <h2>
          {isRegistering
            ? registrationRole === 'admin'
              ? 'Admin Registration'
              : 'Student Registration'
            : selectedRole === 'admin'
              ? 'Admin Login'
              : 'Student Login'}
        </h2>

        {isRegistering ? (
          <>
            <label htmlFor="registrationRole">Register as</label>
            <select
              id="registrationRole"
              value={registrationRole}
              onChange={(event) => {
                setRegistrationRole(event.target.value)
                setMessage('')
              }}
            >
              <option value="student">Student</option>
              <option value="admin">Admin</option>
            </select>

            <label htmlFor="name">Name</label>
            <input
              id="name"
              type="text"
              placeholder="Enter your name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </>
        ) : (
          <>
            <label htmlFor="selectedRole">Login as</label>
            <select
              id="selectedRole"
              value={selectedRole}
              onChange={(event) => {
                setSelectedRole(event.target.value)
                setMessage('')
              }}
            >
              <option value="student">Student</option>
              <option value="admin">Admin</option>
            </select>
          </>
        )}

        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          placeholder="Enter your email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />

        {isRegistering && registrationRole === 'student' && (
          <>
            <label htmlFor="registrationNumber">
              Registration Number
            </label>
            <input
              id="registrationNumber"
              type="text"
              placeholder="Enter your registration number"
              value={registrationNumber}
              onChange={(event) => setRegistrationNumber(event.target.value)}
              required
            />
          </>
        )}

        {isRegistering && registrationRole === 'admin' && (
          <>
            <label htmlFor="adminCode">Admin Code</label>
            <input
              id="adminCode"
              type="password"
              placeholder="Enter admin code"
              value={adminCode}
              onChange={(event) => setAdminCode(event.target.value)}
              autoComplete="off"
              required
            />
          </>
        )}

        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          placeholder="Enter your password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete={
            isRegistering ? 'new-password' : 'current-password'
          }
          required
        />

        <button type="submit" disabled={isLoading}>
          {isLoading ? 'Please wait...' : isRegistering ? 'Register' : 'Log in'}
        </button>

        <p className="auth-switch">
          {isRegistering ? (
            <>
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => switchMode(false)}
              >
                Log in
              </button>
            </>
          ) : (
            <>
              Don’t have an account?{' '}
              <button
                type="button"
                onClick={() => {
                  setRegistrationRole(selectedRole)
                  switchMode(true)
                }}
              >
                Register
              </button>
            </>
          )}
        </p>

        {message && <p role="status">{message}</p>}
      </form>
    </main>
  )
}

export default App