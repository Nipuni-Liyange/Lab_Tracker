import { useState } from 'react'
import './App.css'

function App() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')

  function handleSubmit(event) {
    event.preventDefault()

    if (!email || !password) {
      setMessage('Please enter your email and password.')
      return
    }

    setMessage('Form submitted. Backend login check is the next step.')
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
        <h2>Student Login</h2>

        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          placeholder="Enter your email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />

        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          placeholder="Enter your password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />

        <button type="submit">Log in</button>

        {message && <p role="status">{message}</p>}
      </form>
    </main>
  )
}

export default App