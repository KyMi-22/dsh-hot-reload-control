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
const sandbox = {
  console,
  document: documentStub,
  navigator: { language: 'zh-CN' },
  URL,
  window: {
    __ModuleLoader__: {
      load: ({ id, factory }) => {
        const require = (name) => {
          if (name === 'react') return {
            useState: () => [null, () => {}],
            useEffect: () => {},
            useRef: () => ({ current: null }),
          }
          if (name === 'react/jsx-runtime') return { jsx: () => null, jsxs: () => null }
          throw new Error(`unexpected require: ${name}`)
        }
        const exports = factory(require)
        console.log('registered module:', id, 'inject:', exports.inject)
        if (typeof exports.apply !== 'function') throw new Error('apply missing')
        const ctx = {
          effect: (fn) => fn(),
          locale: {
            register: (ns, value) => {
              dictionaries = { ns, value }
              return () => {}
            },
          },
          slots: {
            inject: (name, cb) => cb(),
            register: (options, component) => {
              registration = { options, component }
              return () => {}
            },
          },
        }
        exports.apply(ctx)
      },
    },
  },
}
vm.runInNewContext(code, sandbox)

console.log('slot:', registration.options)
console.log('component type:', typeof registration.component)
const zh = dictionaries.value.zh
const en = dictionaries.value.en
const zhKeys = Object.keys(zh).sort()
const enKeys = Object.keys(en).sort()
console.log('zh keys:', zhKeys.length, 'en keys:', enKeys.length, 'same:', JSON.stringify(zhKeys) === JSON.stringify(enKeys))
console.log('default label:', zh['action.reload'])
if (registration.options.id !== 'hot-reload-control') process.exit(1)
if (registration.options.order !== 10) process.exit(1)
if (typeof registration.component !== 'function') process.exit(1)
if (JSON.stringify(zhKeys) !== JSON.stringify(enKeys)) process.exit(1)
