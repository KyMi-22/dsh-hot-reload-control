/**
 * dsh-hot-reload-control — detached restart helper source.
 *
 * Why this exists: in the Desktop build the Host is a child process of the
 * Electron shell, and its IPC channel is a closed whitelist. A plugin cannot
 * call `app.relaunch()`, and a Host that exits on its own is treated by the
 * shell as a crash. The only workable path is to leave a small process behind
 * that outlives the shell, asks the shell to terminate, waits for the Host and
 * the fixed port to go away, then starts the same executable with a clean
 * environment (without `ELECTRON_RUN_AS_NODE`).
 *
 * The helper is deliberately plain CommonJS with built-in modules only: it is
 * launched through `electron -e <source>` (Node mode), so it must not depend on
 * anything in this package.
 *
 * @module dsh-hot-reload-control/restart-helper
 */

/** Environment names shared with `lib/index.js`. */
export const HELPER_ENV = Object.freeze({
  /** Executable to relaunch (the Electron application). */
  executable: 'DSH_HRC_EXE',
  /** Electron shell (main) PID to terminate. */
  mainPid: 'DSH_HRC_MAIN_PID',
  /** Current Host (this plugin process) PID. */
  hostPid: 'DSH_HRC_HOST_PID',
  /** Current loopback Web port, used to wait until the old listener is gone. */
  port: 'DSH_HRC_PORT',
  /** Diagnostic log file. */
  logPath: 'DSH_HRC_LOG',
  /** Correlation id for one restart request. */
  requestId: 'DSH_HRC_REQUEST_ID',
})

/**
 * Helper program. Everything is concatenated rather than templated so the
 * outer `String.raw` template needs no interpolation.
 */
export const RESTART_HELPER_SOURCE = String.raw`
const { spawn } = require('node:child_process')
const { appendFileSync, mkdirSync } = require('node:fs')
const { dirname } = require('node:path')
const net = require('node:net')

const exe = process.env.DSH_HRC_EXE
const mainPid = Number(process.env.DSH_HRC_MAIN_PID)
const hostPid = Number(process.env.DSH_HRC_HOST_PID)
const port = Number(process.env.DSH_HRC_PORT)
const logPath = process.env.DSH_HRC_LOG
const requestId = process.env.DSH_HRC_REQUEST_ID || 'unknown'
const helperEnvNames = [
  'DSH_HRC_EXE',
  'DSH_HRC_MAIN_PID',
  'DSH_HRC_HOST_PID',
  'DSH_HRC_PORT',
  'DSH_HRC_LOG',
  'DSH_HRC_REQUEST_ID',
]

const log = (line) => {
  if (!logPath) return
  try {
    mkdirSync(dirname(logPath), { recursive: true })
    appendFileSync(logPath, '[' + new Date().toISOString() + '] [' + requestId + '] ' + line + '\n')
  } catch {}
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const alive = (pid) => {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return Boolean(error && error.code === 'EPERM')
  }
}

const portFree = (value) => new Promise((resolve) => {
  const socket = net.connect({ host: '127.0.0.1', port: value })
  let settled = false
  const done = (free) => {
    if (settled) return
    settled = true
    try { socket.destroy() } catch {}
    resolve(free)
  }
  socket.once('connect', () => done(false))
  socket.once('error', () => done(true))
  setTimeout(() => done(true), 800)
})

;(async () => {
  log('start exe=' + exe + ' main=' + mainPid + ' host=' + hostPid + ' port=' + port)
  if (!exe || !Number.isSafeInteger(mainPid) || mainPid <= 0) {
    log('abort: missing executable or shell pid')
    return
  }

  /* Let the HTTP response reach the page before the window disappears. */
  await sleep(1200)

  try {
    process.kill(mainPid, 'SIGTERM')
    log('sent SIGTERM to shell pid=' + mainPid)
  } catch (error) {
    log('shell SIGTERM failed: ' + (error && error.message))
  }

  /* The Host sees its IPC channel close and shuts down gracefully. */
  let waited = 0
  while (waited < 10000 && alive(hostPid)) {
    await sleep(250)
    waited += 250
  }
  if (alive(hostPid)) {
    try {
      process.kill(hostPid, 'SIGKILL')
      log('sent SIGKILL to host pid=' + hostPid)
    } catch (error) {
      log('host SIGKILL failed: ' + (error && error.message))
    }
    await sleep(500)
  } else {
    log('host exited after ' + waited + 'ms')
  }

  /* On Windows SIGTERM is forceful; wait for the shell to actually go away. */
  let shellWaited = 0
  while (shellWaited < 8000 && alive(mainPid)) {
    await sleep(250)
    shellWaited += 250
  }
  if (alive(mainPid)) {
    try {
      process.kill(mainPid, 'SIGKILL')
      log('sent SIGKILL to shell pid=' + mainPid)
    } catch (error) {
      log('shell SIGKILL failed: ' + (error && error.message))
    }
  }

  /* A new instance must be able to bind; wait for the old listener to vanish. */
  let free = true
  if (Number.isSafeInteger(port) && port > 0) {
    free = false
    for (let index = 0; index < 60; index += 1) {
      if (await portFree(port)) {
        free = true
        break
      }
      await sleep(250)
    }
  }
  log('port ' + port + ' free=' + free)

  /* Relaunch as the Desktop shell, not as Node mode. */
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  for (const name of helperEnvNames) delete env[name]
  try {
    const child = spawn(exe, [], { cwd: dirname(exe), detached: true, stdio: 'ignore', env, windowsHide: false })
    child.unref()
    log('relaunched shell pid=' + (child.pid || 'unknown'))
  } catch (error) {
    log('relaunch failed: ' + (error && error.message))
  }
})()
`
