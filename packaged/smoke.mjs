// Smoke test for the packaged client bundle: load lib/client.js through the
// closure-factory wrapper, verify exports.apply, and run apply() against mock
// ctx/slots to surface ReferenceErrors / bad registrations at load + apply time.
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('./lib/client.js', import.meta.url), 'utf8')

let captured = null
globalThis.window = { __ModuleLoader__: { load: (o) => { captured = o } } }

// Evaluate the bundle (it calls window.__ModuleLoader__.load(...)).
// eslint-disable-next-line no-eval
eval(src)
if (captured === null) throw new Error('__ModuleLoader__.load was not called')

const factory = captured.factory
const mod = { exports: {} }
// React is only referenced inside component render bodies, which never run in
// this smoke test — a bare object satisfies module-load + apply.
const exportsObj = factory(() => ({}))
if (typeof exportsObj.apply !== 'function') throw new Error('exports.apply is not a function')

// apply with slots === undefined → early return, must not throw.
exportsObj.apply({ get: () => undefined, effect: () => {} })
console.log('apply(no slots) OK')

// apply with a mock slots registry exercising all five registrations.
let registerCount = 0
const mockSlots = {
  register: () => { registerCount += 1; return () => {} },
}
const mockCtx = {
  get: (name) => (name === 'slots' ? mockSlots : undefined),
  effect: (fn) => { fn(); return () => {} },
}
exportsObj.apply(mockCtx)
if (registerCount !== 5) throw new Error(`expected 5 registrations, got ${registerCount}`)
console.log(`apply(full) OK — ${registerCount} slot registrations`)
console.log('SMOKE OK')
