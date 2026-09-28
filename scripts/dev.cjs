const { spawn, spawnSync } = require('node:child_process')
const { existsSync } = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const children = new Set()
let stopping = false

function stop(exitCode = 0) {
  if (stopping) return
  stopping = true
  for (const child of children) {
    if (!child.pid || child.exitCode !== null) continue
    // Stop only processes started by this launcher, including Node's watcher.
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
        stdio: 'ignore', windowsHide: true
      })
    } else {
      try { process.kill(-child.pid, 'SIGTERM') } catch { /* Already stopped. */ }
    }
  }
  process.exit(exitCode)
}

process.on('SIGINT', () => stop())
process.on('SIGTERM', () => stop())

function launch(name, directory, args) {
  const child = spawn(process.execPath, args, {
    cwd: path.join(root, directory),
    stdio: 'inherit',
    windowsHide: true,
    detached: process.platform !== 'win32'
  })
  children.add(child)
  child.on('error', error => {
    console.error(`Could not start ${name}: ${error.message}`)
    stop(1)
  })
  child.on('exit', code => {
    children.delete(child)
    if (!stopping) {
      console.error(`${name} stopped (exit ${code}). Run npm run dev again to restart Lab Track.`)
      stop(code || 1)
    }
  })
}

async function probe(url) {
  try {
    return await fetch(url, { signal: AbortSignal.timeout(2000) })
  } catch (error) {
    if (error.name === 'TimeoutError' || error.cause?.code === 'ECONNREFUSED' ||
        error.cause?.errors?.every(item => item.code === 'ECONNREFUSED')) return null
    throw error
  }
}

async function isBackendReady() {
  const response = await probe('http://127.0.0.1:5000/api/health')
  if (!response) return false
  const data = await response.json().catch(() => null)
  if (response.ok && data?.database === 'connected') return true
  throw new Error('Port 5000 is occupied, but the Lab Track backend is not ready. Check the backend terminal and MongoDB service.')
}

async function isFrontendReady() {
  const response = await probe('http://localhost:5173')
  if (!response) return false
  if (response.ok && (await response.text()).includes('<title>Lab Track</title>')) return true
  throw new Error('Port 5173 is occupied by another app. Stop that app before starting Lab Track.')
}

async function isProxyReady() {
  const response = await probe('http://localhost:5173/api/health')
  const data = response && await response.json().catch(() => null)
  return Boolean(response?.ok && data?.database === 'connected')
}

async function waitUntilReady(check, name) {
  const deadline = Date.now() + 20000
  while (Date.now() < deadline) {
    if (await check()) return
    await new Promise(resolve => setTimeout(resolve, 300))
  }
  throw new Error(`${name} did not start. Check the messages above. The backend needs MongoDB running and PORT=5000; the frontend uses port 5173.`)
}

async function main() {
  for (const directory of ['server', 'client']) {
    if (!existsSync(path.join(root, directory, 'node_modules'))) {
      throw new Error(`Dependencies are missing. Run npm install --prefix ${directory}, then npm run dev again.`)
    }
  }
  if (await isBackendReady()) {
    console.log('Lab Track backend is already running; reusing it.')
  } else {
    console.log('Starting the Lab Track backend...')
    launch('Backend', 'server', ['--watch', 'index.js'])
    await waitUntilReady(isBackendReady, 'Backend')
  }
  if (await isFrontendReady()) {
    console.log('Lab Track frontend is already running; reusing it.')
  } else {
    console.log('Starting the Lab Track frontend...')
    launch('Frontend', 'client', ['node_modules/vite/bin/vite.js'])
    await waitUntilReady(isFrontendReady, 'Frontend')
  }
  // Vite or the backend watcher can briefly restart while configuration loads.
  await waitUntilReady(isProxyReady, 'Frontend connection to the backend')
  console.log('\nLab Track is ready: http://localhost:5173')
  console.log(children.size
    ? 'Keep this terminal open. Press Ctrl+C to stop the servers started here.'
    : 'Both servers were already running. Keep their existing terminals open.')
}

main().catch(error => {
  console.error(error.message)
  stop(1)
})
