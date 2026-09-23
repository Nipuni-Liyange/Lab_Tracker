import './App.css'

function App() {
  return (
    <main>
      <h1>Lab Track</h1>
      <p>University Lab Equipment Booking and Management System</p>

      <form onSubmit={(event) => event.preventDefault()}>
        <h2>Student Login</h2>

        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          placeholder="Enter your email"
          required
        />

        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          placeholder="Enter your password"
          required
        />

        <button type="submit">Log in</button>
      </form>
    </main>
  )
}

export default App
