import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { RESTART_HELPER_SOURCE } from '../lib/restart-helper.js'

const dir = mkdtempSync(join(tmpdir(), 'dsh-hrc-helper-'))
const shellPath = join(dir, 'shell.mjs')
const hostPath = join(dir, 'host.mjs')
const infoPath = join(dir, 'info.json')
const logPath = join(dir, 'restart.log')

writeFileSync(hostPath, `setInterval(() => {}, 1000)\n`)
writeFileSync(shellPath, `
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
const host = spawn(process.execPath, [${JSON.stringify(hostPath)}], { stdio: 'ignore' })
writeFileSync(${JSON.stringify(infoPath)}, JSON.stringify({ shellPid: process.pid, hostPid: host.pid }))
setInterval(() => {}, 1000)
`)

const shell = spawn(process.execPath, [shellPath], { stdio: 'ignore' })
let info
for (let i = 0; i < 50; i += 1) {
  try {
    info = JSON.parse(readFileSync(infoPath, 'utf8'))
    break
  } catch {
    await sleep(100)
  }
}
if (!info) throw new Error('shell did not publish pids')
console.log('dummy shell/host:', info)

const helper = spawn(process.execPath, ['-e', RESTART_HELPER_SOURCE], {
  env: {
    ...process.env,
    DSH_HRC_EXE: process.execPath,
    DSH_HRC_MAIN_PID: String(info.shellPid),
    DSH_HRC_HOST_PID: String(info.hostPid),
    DSH_HRC_PORT: '0',
    DSH_HRC_LOG: logPath,
    DSH_HRC_REQUEST_ID: 'test-helper',
  },
  stdio: 'ignore',
})

const exitCode = await new Promise((resolve) => helper.once('exit', resolve))
console.log('helper exit:', exitCode)

function alive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
console.log('shell alive:', alive(info.shellPid), 'host alive:', alive(info.hostPid))
console.log('--- log ---')
console.log(readFileSync(logPath, 'utf8'))
if (alive(info.shellPid) || alive(info.hostPid)) process.exitCode = 1
if (!/relaunched shell pid=/.test(readFileSync(logPath, 'utf8'))) process.exitCode = 1
try { shell.kill('SIGKILL') } catch {}
rmSync(dir, { recursive: true, force: true })
