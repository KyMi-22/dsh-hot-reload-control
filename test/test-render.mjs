import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const code = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
let registration
let dictionaries
const documentStub = {
  baseURI: 'http://localhost/',
  querySelector: () => null,
  createElement: () => ({ dataset: {}, style: {}, textContent: '' }),
  head: { appendChild: () => {} },
}
const initialStates = [false, 'idle', null, null]
let stateIndex = 0
const reactMock = {
  useState: () => {
    const index = stateIndex
    stateIndex += 1
    return [initialStates[index], () => {}]
  },
  useEffect: () => {},
  useRef: (initial) => ({ current: initial ?? null }),
}
const sandbox = {
  console,
  document: documentStub,
  navigator: { language: 'zh-CN' },
  URL,
  window: {
    __ModuleLoader__: {
      load: ({ factory }) => {
        const require = (name) => {
          if (name === 'react') return reactMock
          if (name === 'react/jsx-runtime') {
            return {
              jsx: (type, props) => typeof type === 'function' ? type(props) : { type, props },
              jsxs: (type, props) => typeof type === 'function' ? type(props) : { type, props },
            }
          }
          throw new Error(`unexpected require: ${name}`)
        }
        const exports = factory(require)
        const ctx = {
          effect: (fn) => fn(),
          locale: { register: (ns, value) => { dictionaries = { ns, value }; return () => {} } },
          slots: {
            inject: (name, cb) => cb(),
            register: (options, component) => { registration = { options, component }; return () => {} },
          },
        }
        exports.apply(ctx)
      },
    },
  },
}
vm.runInNewContext(code, sandbox)
const zh = dictionaries.value.zh
const t = (key, params) => {
  const template = zh[key] ?? key
  if (params === undefined) return template
  return template.replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? ''))
}

function render(states) {
  initialStates.splice(0, initialStates.length, ...states)
  stateIndex = 0
  return registration.component({ t })
}

function walk(node, visit) {
  if (node === null || node === undefined) return
  if (Array.isArray(node)) { node.forEach((child) => walk(child, visit)); return }
  if (typeof node !== 'object') return
  visit(node)
  walk(node.props?.children, visit)
}

function collect(tree) {
  const labels = []
  let buttons = 0
  walk(tree, (node) => {
    if (node.type === 'button') buttons += 1
    if (node.type === 'span' && typeof node.props?.children === 'string') labels.push(node.props.children)
    if (node.type === 'button' && typeof node.props?.children === 'string') labels.push(node.props.children)
    if (node.type === 'h2' && typeof node.props?.children === 'string') labels.push(node.props.children)
    if (node.type === 'p' && typeof node.props?.children === 'string') labels.push(node.props.children)
  })
  return { labels, buttons }
}

const idle = collect(render([false, 'idle', null, null]))
console.log('idle:', idle)
if (!idle.labels.includes('热重载') || idle.buttons < 2) process.exit(1)

const menu = collect(render([true, 'idle', null, null]))
console.log('menu labels:', menu.labels.join(' | '))
if (!menu.labels.includes('重启应用') || !menu.labels.includes('默认')) process.exit(1)

const confirm = collect(render([false, 'idle', null, { activity: { active: true, activeAgents: 1, activeJobs: 2 }, unknown: false }]))
console.log('confirm labels:', confirm.labels.join(' | '))
if (!confirm.labels.includes('重启 DSH？') || !confirm.labels.includes('确认重启')) process.exit(1)
