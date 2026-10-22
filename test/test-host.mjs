import { PassThrough } from 'node:stream'
import { apply } from '../lib/index.js'

let handler
const calls = { hmr: 0, restart: 0 }
const fakeHmr = {
  runExclusive: async (fn) => {
    calls.hmr += 1
    return fn()
  },
  reconcileProfile: async () => ({ warnings: ['w1'], pending: [{ url: 'file:///x.js' }] }),
}
const ctx = {
  logger: { info: () => {}, warn: () => {} },
  effect: (fn) => fn(),
  get: (name) => {
    if (name === 'hmr') return fakeHmr
    if (name === 'agents') return { list: () => [{ id: 'a', status: 'running' }] }
    if (name === 'jobs') return { list: () => [{ status: 'running' }] }
    return undefined
  },
  connection: { requestRejection: () => undefined },
  webServer: {
    port: 1781,
    register: (route) => {
      handler = route.handler
      return () => {}
    },
  },
}
apply(ctx)

function req(body) {
  const stream = new PassThrough()
  stream.method = 'POST'
  stream.url = '/dsh-hot-reload-control/api'
  stream.headers = { 'content-type': 'application/json' }
  process.nextTick(() => stream.end(JSON.stringify(body)))
  return stream
}

function res() {
  return {
    statusCode: 0,
    headers: {},
    headersSent: false,
    writeHead(status, headers) {
      this.statusCode = status
      this.headers = headers
      this.headersSent = true
    },
    end(body) {
      this.body = body
    },
  }
}

const statusRes = res()
await handler(req({ method: 'status' }), statusRes)
console.log('status', statusRes.statusCode, statusRes.body)
if (statusRes.statusCode !== 200) process.exit(1)

const reloadRes = res()
await handler(req({ method: 'reload' }), reloadRes)
console.log('reload', reloadRes.statusCode, reloadRes.body)
if (reloadRes.statusCode !== 200 || calls.hmr !== 1) process.exit(1)

const restartRes = res()
await handler(req({ method: 'restart' }), restartRes)
console.log('restart', restartRes.statusCode, restartRes.body)
if (restartRes.statusCode !== 409) process.exit(1)

const badRes = res()
await handler(req({ method: 'nope' }), badRes)
console.log('unknown', badRes.statusCode)
if (badRes.statusCode !== 404) process.exit(1)
