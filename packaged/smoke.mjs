// Smoke test for the packaged client bundle: load lib/client.js through the
// closure-factory wrapper, verify exports.apply, and run apply() against mock
// ctx/slots to surface ReferenceErrors / bad registrations at load + apply time.
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('./lib/client.js', import.meta.url), 'utf8')

let captured = null
globalThis.window = { __ModuleLoader__: { load: (o) => { captured = o } } }
// The client registers a document-level click listener in apply() and binds
// the browser core from dsh-builtin-browser/client; stub both for the smoke.
globalThis.document = { addEventListener: () => {}, removeEventListener: () => {} }
globalThis.Element = class Element {}

// Evaluate the bundle (it calls window.__ModuleLoader__.load(...)).
// eslint-disable-next-line no-eval
eval(src)
if (captured === null) throw new Error('__ModuleLoader__.load was not called')

const factory = captured.factory
const mod = { exports: {} }
// React is only referenced inside component render bodies, which never run in
// this smoke test; the browser core is resolved through ctx.modules.import()
// (async) and stubbed with the exported surface used at apply time.
const coreStub = {
  browserStore: {
    get: () => ({ open: false, tabs: [], activeTabId: 0, picking: false, toast: null, pending: null, inShell: false }),
    subscribe: () => () => {}, setOpen: () => {}, setPicking: () => {},
    setSurface: () => {}, getSurface: () => null,
    setPendingCommand: () => {}, takePendingCommand: () => null,
  },
  pageBrowserController: { command: async () => ({ ok: true }) },
  BLANK_PAGE: 'about:blank',
  setOpenHandler: () => {},
  togglePicking: () => {},
  stopPicking: async () => {},
}
const exportsObj = factory(() => ({}))
if (typeof exportsObj.apply !== 'function') throw new Error('exports.apply is not a function')

// apply with slots === undefined → early return, must not throw.
await exportsObj.apply({ get: () => undefined, effect: () => {} })
console.log('apply(no slots) OK')

// apply with a mock slots registry exercising all registrations (the shell,
// two activity + two panel entries, and the three inject-waited slots: the
// global-views overlay entry plus the two builtin-browser shadow entries).
let registerCount = 0
const mockSlots = {
  register: () => { registerCount += 1; return () => {} },
  inject: (_key, callback) => { callback(); return () => {} },
}
const mockCtx = {
  get: (name) => (name === 'slots' ? mockSlots : undefined),
  effect: (fn) => { fn(); return () => {} },
  modules: { import: async (id) => (id === 'dsh-builtin-browser/client' ? coreStub : {}) },
}
await exportsObj.apply(mockCtx)
if (registerCount !== 8) throw new Error(`expected 8 registrations, got ${registerCount}`)
console.log(`apply(full) OK — ${registerCount} slot registrations`)
console.log('SMOKE OK')
