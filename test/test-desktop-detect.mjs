import { PassThrough } from 'node:stream'
import { apply } from '../lib/index.js'

let handler
const ctx = {
  logger: { info: () => {}, warn: () => {} },
  effect: (fn) => fn(),
  get: () => undefined,
  connection: { requestRejection: () => undefined },
  webServer: { port: 1781, register: (route) => { handler = route.handler; return () => {} } },
}
apply(ctx)

const req = new PassThrough()
req.method = 'POST'
req.url = '/dsh-hot-reload-control/api'
req.headers = { 'content-type': 'application/json' }
process.nextTick(() => req.end(JSON.stringify({ method: 'status' })))
const res = {
  statusCode: 0,
  headers: {},
  headersSent: false,
  writeHead(status, headers) { this.statusCode = status; this.headers = headers; this.headersSent = true },
  end(body) { this.body = body },
}
await handler(req, res)
const value = JSON.parse(res.body).value
console.log(JSON.stringify(value, null, 2))
if (value.restart.available !== true) process.exit(1)
if (value.runtime.desktop !== true) process.exit(1)
