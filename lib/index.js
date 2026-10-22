/**
 * dsh-hot-reload-control — Host half.
 *
 * Two actions are exposed to the settings dropdown through one small,
 * same-origin JSON route:
 *
 * - `reload` asks DSH's own HMR service to recompose the profile. This loads
 *   newly installed Host plugins and applies `cordis.patch.yml` changes while
 *   the process and window stay alive. It writes nothing to any configuration
 *   file — the marker-file trick some restart plugins use is deliberately not
 *   part of this plugin.
 * - `restart` is Desktop-only. A detached helper terminates the Electron
 *   shell, waits for this Host and the old loopback port to disappear, then
 *   starts the application again with a clean environment. That is the only
 *   way to reach `app.relaunch()` from a plugin: the Host is an Electron child
 *   process whose IPC channel is a closed whitelist, and a Host that exits by
 *   itself is treated as a crash by the shell.
 *
 * Requests pass the official connection trust fence
 * (`ctx.connection.requestRejection`), so only an authenticated same-origin
 * browser reaches them.
 *
 * @module dsh-hot-reload-control
 */

import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { HELPER_ENV, RESTART_HELPER_SOURCE } from './restart-helper.js'

/** Stable Cordis plugin name. */
export const name = 'dsh-hot-reload-control'

/** Services required before the route can be claimed. */
export const inject = ['webServer', 'connection']

/** Route prefix owned by this plugin. */
const API_PREFIX = '/dsh-hot-reload-control/api'

/** Only tiny JSON bodies are accepted. */
const MAX_BODY_BYTES = 64 * 1024

/** Refuse a second restart for this long after one was scheduled. */
const RESTART_BUSY_MS = 60_000

/** Diagnostic log location below `$DSH_HOME`. */
const LOG_RELATIVE = join('dsh-hot-reload-control', 'restart.log')

/** Resolve the Harness home the same way the launcher does. */
function dshHome() {
  const fromEnv = process.env.DSH_HOME
  return fromEnv !== undefined && fromEnv.trim() !== '' ? resolve(fromEnv.trim()) : join(homedir(), '.dsh')
}

/** Absolute helper log path. */
function restartLogPath() {
  return join(dshHome(), LOG_RELATIVE)
}

/** Runtime directory passed to the Desktop Host entry point. */
function runtimeDirectory() {
  const value = process.argv[2]
  return typeof value === 'string' && value !== '' ? value : undefined
}

/**
 * Whether this Host is the packaged Desktop child. `DSH_CLIENT_VERSION` is
 * injected by the Electron shell, and the packaged runtime lives inside
 * `app.asar`; a bare `dsh web` process (or a development checkout) must never
 * terminate its parent shell.
 */
function packagedDesktop() {
  if (process.env.ELECTRON_RUN_AS_NODE !== '1') return false
  if (typeof process.env.DSH_CLIENT_VERSION !== 'string' || process.env.DSH_CLIENT_VERSION === '') return false
  const runtime = runtimeDirectory()
  return runtime !== undefined && /(^|[\\/])app\.asar([\\/]|$)/u.test(runtime)
}

/** Why a full application restart is unavailable on this Host. */
function restartUnavailableReason() {
  if (process.env.ELECTRON_RUN_AS_NODE !== '1') return 'not-desktop'
  if (typeof process.env.DSH_CLIENT_VERSION !== 'string' || process.env.DSH_CLIENT_VERSION === '') return 'not-desktop'
  if (!packagedDesktop()) return 'development'
  return undefined
}

/** The HMR service, when this profile composition provides one. */
function hmrService(ctx) {
  try {
    const service = ctx.get('hmr')
    if (service === undefined || service === null) return undefined
    if (typeof service.runExclusive !== 'function') return undefined
    if (typeof service.reconcileProfile !== 'function') return undefined
    return service
  } catch {
    return undefined
  }
}

/**
 * Read the current workload for the restart confirmation. Any unavailable
 * service means "unknown", never a hard failure.
 */
function inspectActivity(ctx) {
  const result = {
    active: false,
    known: false,
    agents: 0,
    activeAgents: 0,
    jobs: 0,
    activeJobs: 0,
  }
  try {
    const agents = ctx.get('agents')
    if (agents === undefined || typeof agents.list !== 'function') return result
    const roster = agents.list()
    if (!Array.isArray(roster)) return result
    result.known = true
    result.agents = roster.length
    result.activeAgents = roster.filter((agent) =>
      agent?.status === 'running' ||
      (agent?.inbox?.nextTurn?.length ?? 0) > 0 ||
      (agent?.inbox?.nextStep?.length ?? 0) > 0).length
    result.active = result.activeAgents > 0
    const jobs = ctx.get('jobs')
    if (jobs !== undefined && typeof jobs.list === 'function') {
      for (const agent of [undefined, ...roster]) {
        const list = jobs.list(agent?.id)
        if (!Array.isArray(list)) continue
        for (const job of list) {
          result.jobs += 1
          if (job?.status === 'running' || job?.status === 'stopping') {
            result.activeJobs += 1
            result.active = true
          }
        }
      }
    }
    return result
  } catch {
    return result
  }
}

/** One error with a stable code, surfaced to the browser as-is. */
function codedError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

/**
 * Trigger one profile recomposition through DSH's HMR service.
 * @param ctx - Host context.
 * @returns Warnings, pending modules, and a possible restart reason.
 */
async function hotReload(ctx) {
  const hmr = hmrService(ctx)
  if (hmr === undefined) {
    throw codedError('hmr-unavailable', 'the Host has no HMR service; use Restart to apply changes')
  }
  const outcome = await hmr.runExclusive(() => hmr.reconcileProfile())
  const warnings = Array.isArray(outcome?.warnings) ? outcome.warnings.map(String) : []
  const pending = Array.isArray(outcome?.pending)
    ? outcome.pending.map((entry) => typeof entry === 'string' ? entry : String(entry?.url ?? entry))
    : []
  return {
    warnings,
    pending,
    restartReason: typeof outcome?.restartReason === 'string' ? outcome.restartReason : null,
  }
}

/**
 * Schedule a full application restart through a detached helper.
 * @param port - Current loopback Web port.
 * @returns Helper and process identifiers for diagnostics.
 */
function scheduleRestart(port) {
  const executable = process.execPath
  if (!existsSync(executable)) {
    throw codedError('restart-unavailable', `the application executable was not found: ${executable}`)
  }
  const requestId = `${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`
  const environment = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    [HELPER_ENV.executable]: executable,
    [HELPER_ENV.mainPid]: String(process.ppid),
    [HELPER_ENV.hostPid]: String(process.pid),
    [HELPER_ENV.port]: String(port ?? 0),
    [HELPER_ENV.logPath]: restartLogPath(),
    [HELPER_ENV.requestId]: requestId,
  }
  const helper = spawn(executable, ['-e', RESTART_HELPER_SOURCE], {
    env: environment,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  })
  helper.unref()
  return {
    helperPid: helper.pid ?? null,
    requestId,
    shellPid: process.ppid,
    hostPid: process.pid,
    executable,
    logPath: restartLogPath(),
  }
}

/** Tail of the helper log, for troubleshooting. */
function readRestartLog(limit = 40) {
  const file = restartLogPath()
  if (!existsSync(file)) return { exists: false, logPath: file, tail: '' }
  try {
    const lines = readFileSync(file, 'utf8').split(/\r?\n/u).filter((line) => line !== '')
    return { exists: true, logPath: file, tail: lines.slice(-limit).join('\n') }
  } catch (error) {
    return {
      exists: true,
      logPath: file,
      tail: '',
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

// ── JSON transport ──────────────────────────────────────────────────────────

const PAYLOAD_TOO_LARGE = Symbol('payload-too-large')

/** Read a bounded JSON body; malformed input resolves `null`. */
function readJsonBody(req) {
  return new Promise((resolveBody) => {
    const chunks = []
    let size = 0
    let aborted = false
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES && !aborted) {
        aborted = true
        req.destroy()
        resolveBody(PAYLOAD_TOO_LARGE)
        return
      }
      if (!aborted) chunks.push(chunk)
    })
    req.on('end', () => {
      if (aborted) return
      try {
        resolveBody(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        resolveBody(null)
      }
    })
    req.on('error', () => {
      if (!aborted) resolveBody(null)
    })
  })
}

/** Write one JSON response. */
function writeJson(res, status, value) {
  const body = JSON.stringify(value)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(body)
}

/** Failure shape understood by the browser half. */
function fail(res, status, code, message) {
  writeJson(res, status, { ok: false, error: { code, message } })
}

/** Reject a request that the official connection fence does not admit. */
function rejected(ctx, req) {
  try {
    const rejection = ctx.connection.requestRejection(req)
    return typeof rejection === 'number' ? rejection : undefined
  } catch {
    return 403
  }
}

// ── RPC ─────────────────────────────────────────────────────────────────────

/** Handle one control request. */
async function handleApi(ctx, req, res, state) {
  if (req.method !== 'POST') {
    fail(res, 405, 'method-not-allowed', 'POST is required')
    return
  }
  const contentType = typeof req.headers['content-type'] === 'string'
    ? req.headers['content-type'].toLowerCase()
    : ''
  if (!contentType.startsWith('application/json')) {
    fail(res, 415, 'unsupported-media-type', 'content-type must be application/json')
    return
  }

  const payload = await readJsonBody(req)
  if (payload === PAYLOAD_TOO_LARGE) {
    fail(res, 413, 'payload-too-large', 'request body is too large')
    return
  }
  if (payload === null || typeof payload !== 'object' || typeof payload.method !== 'string') {
    fail(res, 400, 'bad-request', 'bad request')
    return
  }

  if (payload.method === 'status') {
    const hmr = hmrService(ctx)
    const reason = restartUnavailableReason()
    writeJson(res, 200, {
      ok: true,
      value: {
        plugin: name,
        profile: typeof process.env.DSH_PROFILE === 'string' ? process.env.DSH_PROFILE : null,
        runtime: {
          desktop: reason === undefined,
          packaged: packagedDesktop(),
          shellPid: process.ppid,
          hostPid: process.pid,
          executable: process.execPath,
          platform: process.platform,
        },
        hmr: {
          available: hmr !== undefined,
          reason: hmr === undefined ? 'hmr-unavailable' : null,
        },
        restart: {
          available: reason === undefined,
          reason: reason ?? null,
          logPath: restartLogPath(),
        },
        activity: inspectActivity(ctx),
        busy: Date.now() < state.restartingUntil || state.reloading,
      },
    })
    return
  }

  if (payload.method === 'reload') {
    if (state.reloading) {
      fail(res, 409, 'reload-busy', 'a hot reload is already running')
      return
    }
    state.reloading = true
    try {
      const value = await hotReload(ctx)
      ctx.logger?.info?.(
        'dsh-hot-reload-control: hot reload applied (warnings=%d pending=%d restartReason=%s)',
        value.warnings.length,
        value.pending.length,
        String(value.restartReason),
      )
      writeJson(res, 200, {
        ok: true,
        value: {
          mode: 'hmr-recompose',
          ...value,
          appliedAt: new Date().toISOString(),
        },
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      ctx.logger?.warn?.('dsh-hot-reload-control: hot reload failed: %s', message)
      const code = error?.code === 'hmr-unavailable' ? 'hmr-unavailable' : 'reload-failed'
      fail(res, code === 'hmr-unavailable' ? 409 : 500, code, message)
    } finally {
      state.reloading = false
    }
    return
  }

  if (payload.method === 'restart') {
    const reason = restartUnavailableReason()
    if (reason !== undefined) {
      fail(res, 409, 'restart-unavailable', `application restart is unavailable (${reason})`)
      return
    }
    if (Date.now() < state.restartingUntil) {
      fail(res, 409, 'restart-busy', 'a restart is already scheduled')
      return
    }
    try {
      const value = scheduleRestart(ctx.webServer.port)
      state.restartingUntil = Date.now() + RESTART_BUSY_MS
      ctx.logger?.info?.(
        'dsh-hot-reload-control: restart scheduled (helper=%s shell=%s host=%s)',
        String(value.helperPid),
        String(value.shellPid),
        String(value.hostPid),
      )
      writeJson(res, 202, {
        ok: true,
        value: {
          mode: 'application-restart',
          ...value,
          scheduledAt: new Date().toISOString(),
        },
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      ctx.logger?.warn?.('dsh-hot-reload-control: restart failed: %s', message)
      fail(res, 500, 'restart-failed', message)
    }
    return
  }

  if (payload.method === 'log') {
    writeJson(res, 200, { ok: true, value: readRestartLog() })
    return
  }

  fail(res, 404, 'not-found', `unknown method "${payload.method}"`)
}

/**
 * Mount the Host half.
 * @param ctx - Host context carrying `webServer` and `connection`.
 */
export function apply(ctx) {
  const state = {
    reloading: false,
    restartingUntil: 0,
  }

  try {
    mkdirSync(dirname(restartLogPath()), { recursive: true })
  } catch {
    /* Logging is best effort; the action does not depend on the directory. */
  }

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: API_PREFIX,
    handler: async (req, res) => {
      const rejection = rejected(ctx, req)
      if (rejection !== undefined) {
        res.statusCode = rejection
        res.end()
        return
      }
      const pathname = new URL(String(req.url ?? '/'), 'http://localhost').pathname
      if (pathname !== API_PREFIX) {
        fail(res, 404, 'not-found', 'not found')
        return
      }
      try {
        await handleApi(ctx, req, res, state)
      } catch (error) {
        console.error('[dsh-hot-reload-control] control API error:', error)
        if (!res.headersSent) fail(res, 500, 'internal', 'internal error')
      }
    },
  }), 'dsh-hot-reload-control: control API')
}
