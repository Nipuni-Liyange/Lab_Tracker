import { useEffect, useState } from 'react'
import './App.css'

const connectionMessage = 'The login service is temporarily unavailable. We will reconnect automatically when it is available.'

function Icon({ name, className = '' }) {
  const paths = {
    flask: 'M9 3h6M10 3v7l-5 8a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-8V3M8 15h8',
    user: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M4 21v-2a8 8 0 0 1 16 0v2',
    mail: 'M4 5h16v14H4zM4 6l8 6 8-6',
    lock: 'M6 10h12v11H6zM8 10V7a4 4 0 0 1 8 0v3M12 14v3',
    id: 'M3 5h18v14H3zM7 9h3M7 13h3M14 9h3M14 13h3',
    arrow: 'M4 12h16M14 6l6 6-6 6',
    eye: 'M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
    shield: 'M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6zM8 12l3 3 5-6',
  }
  return <svg className={`icon ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>
}

async function authRequest(path, options = {}) {
  const response = await fetch(path, { credentials: 'same-origin', ...options })
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new Error(connectionMessage)
  }
  const data = await response.json()
  return { response, data }
}

function App() {
  const [session, setSession] = useState(null)
  const [isCheckingSession, setIsCheckingSession] = useState(true)
  const [sessionError, setSessionError] = useState('')
  const [sessionCheck, setSessionCheck] = useState(0)
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
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    let retryTimer
    async function restoreSession() {
      try {
        const { response, data } = await authRequest('/api/auth/me', { signal: controller.signal })
        if (response.ok) setSession(data)
        else if (response.status !== 401) throw new Error(data.message || 'Unable to check your session.')
        setSessionError('')
      } catch (error) {
        if (!controller.signal.aborted) {
          setSessionError(error.message === 'Failed to fetch'
            ? connectionMessage : error.message)
          retryTimer = window.setTimeout(restoreSession, 5000)
        }
      } finally {
        if (!controller.signal.aborted) setIsCheckingSession(false)
      }
    }
    restoreSession()
    return () => {
      controller.abort()
      window.clearTimeout(retryTimer)
    }
  }, [sessionCheck])

  useEffect(() => {
    if (!session) return
    const controller = new AbortController()
    function sessionEnded() {
      setSession(null)
      setShowPassword(false)
      setPassword('')
      setIsRegistering(false)
      setMessage('Your session has ended. Please log in again.')
    }
    async function checkSession() {
      try {
        const { response } = await authRequest('/api/auth/me', { signal: controller.signal })
        if (response.status === 401) sessionEnded()
      } catch {
        // Keep the current screen during a temporary network outage.
      }
    }
    const timeout = window.setTimeout(sessionEnded,
      Math.max(0, new Date(session.expiresAt).getTime() - Date.now()))
    window.addEventListener('focus', checkSession)
    return () => {
      controller.abort()
      window.clearTimeout(timeout)
      window.removeEventListener('focus', checkSession)
    }
  }, [session])

  async function handleLogout() {
    setIsLoading(true)
    setMessage('')
    try {
      const { response, data } = await authRequest('/api/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!response.ok) throw new Error(data.message || 'Logout failed. Please try again.')
      setSession(null)
      setShowPassword(false)
      setPassword('')
      setAdminCode('')
      setIsRegistering(false)
      setMessage('You have been logged out.')
    } catch {
      setMessage('Could not log out. Check your connection and try again.')
    } finally {
      setIsLoading(false)
    }
  }

  function switchMode(registering) {
    setIsRegistering(registering)
    setShowPassword(false)
    setPassword('')
    setMessage('')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setMessage('')

    setIsLoading(true)

    try {
      const payload = isRegistering
        ? {
            name,
            email,
            password,
            role: registrationRole,
            ...(registrationRole === 'student' ? { registrationNumber } : { adminCode }),
          }
        : { email, password, role: selectedRole }
      const { response, data } = await authRequest(`/api/auth/${isRegistering ? 'register' : 'login'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        setMessage(data.message || (isRegistering ? 'Registration failed.' : 'Login failed.'))
        return
      }

      if (isRegistering) {
        setSelectedRole(registrationRole)
        setIsRegistering(false)
        setShowPassword(false)
        setPassword('')
        setAdminCode('')
        setMessage('Registration successful! You can now log in with your email and password.')
        return
      }

      setSession(data)
      setShowPassword(false)
      setMessage('')
      setPassword('')
    } catch {
      setMessage('Cannot connect to the backend. Check that it is running.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <header className="site-header">
        <div className="brand-lockup">
          <span className="brand-mark"><Icon name="flask" /></span>
          <h1 className="brand-title">Lab <span>Track</span></h1>
        </div>
        <span className="header-caption"><span />UNIVERSITY LAB PORTAL</span>
      </header>
    <main className="auth-layout">
      <section className="welcome-section" aria-labelledby="welcome-title">
        <p className="welcome-eyebrow"><span />A SPACE FOR DISCOVERY</p>
        <h2 id="welcome-title">Your next {' '}<br />discovery <br /><span>starts here</span></h2>
        <p className="welcome-description">University Lab Equipment Booking<br className="desktop-break" /> and Management System</p>
        <div className="welcome-note"><span className="note-line" /><p>Built for curious minds.<br /><strong>Connected for better work.</strong></p></div>
        <div className="welcome-caption"><Icon name="flask" /><span>FOR STUDENTS & LAB ADMINISTRATORS</span></div>
      </section>
      <div className="auth-column">
      <div className={`auth-frame${isRegistering && !session ? ' is-registering' : ''}`}>
      {isCheckingSession ? (
        <section className="auth-panel account-card connection-card" aria-live="polite">
          <span className="loading-ring" aria-hidden="true" />
          <p>Checking your session...</p>
        </section>
      ) : sessionError ? (
        <section className="auth-panel account-card connection-card">
          <h2>Unable to connect</h2>
          <p role="alert">{sessionError}</p>
          <button type="button" onClick={() => {
            setSessionError('')
            setIsCheckingSession(true)
            setSessionCheck(value => value + 1)
          }}>Try again</button>
        </section>
      ) : session ? (
        <section className="auth-panel account-card" aria-labelledby="account-title">
          <div className="panel-emblem"><Icon name="shield" /></div>
          <p className="account-badge">{session.user.role === 'admin' ? 'Administrator' : 'Student'} account</p>
          <h2 id="account-title">Welcome{session.user.name ? `, ${session.user.name}` : ''}!</h2>
          <p>You are successfully logged in to Lab Track.</p>
          <dl className="account-details">
            <dt>Name</dt><dd>{session.user.name || 'Not provided'}</dd>
            <dt>Email</dt><dd>{session.user.email}</dd>
            {session.user.role === 'student' && <>
              <dt>Registration number</dt><dd>{session.user.registrationNumber || 'Not provided'}</dd>
            </>}
            <dt>Role</dt><dd>{session.user.role === 'admin' ? 'Administrator' : 'Student'}</dd>
          </dl>
          <button type="button" onClick={handleLogout} disabled={isLoading}>
            {isLoading ? 'Logging out...' : 'Log out'}
          </button>
          {message && <p className="auth-message" role="status">{message}</p>}
        </section>
      ) : <form className="auth-panel" key={isRegistering ? 'register' : 'login'} onSubmit={handleSubmit} aria-labelledby="auth-title">
        <div className="panel-emblem"><Icon name={isRegistering ? 'user' : 'lock'} /></div>
        <p className="eyebrow">{isRegistering ? 'JOIN YOUR LAB COMMUNITY' : 'YOUR WORKSPACE AWAITS'}</p>
        <h2 id="auth-title">
          {isRegistering
            ? registrationRole === 'admin'
              ? 'Admin Registration'
              : 'Student Registration'
            : selectedRole === 'admin'
              ? 'Admin Login'
              : 'Student Login'}
        </h2>
        <p className="panel-subtitle">{isRegistering ? 'One account. A more connected lab.' : 'Welcome back. Let’s get you signed in.'}</p>

        {isRegistering ? (
          <>
            <label htmlFor="registrationRole">Register as</label>
            <div className="input-wrap">
            <Icon name="user" />
            <select
              id="registrationRole"
              disabled={isLoading}
              value={registrationRole}
              onChange={(event) => {
                setRegistrationRole(event.target.value)
                setMessage('')
              }}
            >
              <option value="student">Student</option>
              <option value="admin">Admin</option>
            </select>
            </div>

            <label htmlFor="name">Name</label>
            <div className="input-wrap">
            <Icon name="user" />
            <input
              id="name"
              type="text"
              autoComplete="name"
              maxLength={100}
              placeholder="Enter your name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
            </div>
          </>
        ) : (
          <>
            <label htmlFor="selectedRole">Login as</label>
            <div className="input-wrap">
            <Icon name="user" />
            <select
              id="selectedRole"
              disabled={isLoading}
              value={selectedRole}
              onChange={(event) => {
                setSelectedRole(event.target.value)
                setMessage('')
              }}
            >
              <option value="student">Student</option>
              <option value="admin">Admin</option>
            </select>
            </div>
          </>
        )}

        <label htmlFor="email">Email</label>
        <div className="input-wrap">
        <Icon name="mail" />
        <input
          id="email"
          type="email"
          autoComplete="username"
          maxLength={254}
          placeholder="Enter your email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        </div>

        {isRegistering && registrationRole === 'student' && (
          <>
            <label htmlFor="registrationNumber">
              Registration Number
            </label>
            <div className="input-wrap">
            <Icon name="id" />
            <input
              id="registrationNumber"
              type="text"
              maxLength={50}
              placeholder="Enter your registration number"
              value={registrationNumber}
              onChange={(event) => setRegistrationNumber(event.target.value)}
              required
            />
            </div>
          </>
        )}

        {isRegistering && registrationRole === 'admin' && (
          <>
            <label htmlFor="adminCode">Admin Code</label>
            <div className="input-wrap">
            <Icon name="shield" />
            <input
              id="adminCode"
              type="password"
              placeholder="Enter admin code"
              value={adminCode}
              onChange={(event) => setAdminCode(event.target.value)}
              autoComplete="off"
              required
            />
            </div>
          </>
        )}

        <label htmlFor="password">Password</label>
        <div className="input-wrap password-wrap">
        <Icon name="lock" />
        <input
          id="password"
          type={showPassword ? 'text' : 'password'}
          placeholder="Enter your password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete={
            isRegistering ? 'new-password' : 'current-password'
          }
          minLength={isRegistering ? 8 : undefined}
          required
        />
        <button className="password-toggle" type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>
          <Icon name="eye" />
        </button>
        </div>
        {isRegistering && <p className="field-hint">Use at least 8 characters for your password.</p>}

        <button className="submit-button" type="submit" disabled={isLoading}>
          <span>{isLoading ? 'Please wait...' : isRegistering ? 'Create account' : 'Log in'}</span>
          {isLoading ? <span className="button-spinner" aria-hidden="true" /> : <Icon name="arrow" />}
        </button>

        <p className="auth-switch">
          {isRegistering ? (
            <>
              Already have an account?{' '}
              <button
                type="button"
                disabled={isLoading}
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
                disabled={isLoading}
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

        {message && <p className="auth-message" role="status">{message}</p>}
      </form>}
      </div>
      <footer className="auth-footer"><Icon name="shield" /><span>Your lab. Your space. Securely connected.</span></footer>
      </div>
    </main>
    <footer className="site-footer"><span>LAB TRACK <span className="footer-dot">/</span> CAMPUS WORKSPACE</span><span>Made for the way you work.</span></footer>
    </div>
  )
}

export default App
