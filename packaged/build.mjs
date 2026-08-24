// dsh-sidebar-live build: produces lib/index.js (host empty apply, ESM) and
// lib/client.js (browser bundle in the dsh closure-factory format) without
// any toolchain — plain JS only.
//
// The client source (src/client/index.js) is a module-scope body that defines
// `apply` plus helpers and references the `React` closure symbol; the wrapper
// below binds React from the loader module table and exports apply, exactly
// like the tsdown-built bundles (plugin/lib/client.js).
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const PACKAGE_ID = 'dsh-sidebar-live'

const host = `/**
 * dsh-sidebar-live host half. Pure UI plugin: the empty apply exists so the
 * plugin appears in the host cordis.yml / Loader (load and lifecycle follow
 * the host; the browser half ships via exports["./client"]).
 */
export const apply = () => {}
`

const clientSrc = await readFile(new URL('src/client/index.js', import.meta.url), 'utf8')
const client = `window.__ModuleLoader__.load({
  id: ${JSON.stringify(PACKAGE_ID)},
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
    const React = require('react');
${clientSrc}
    exports.apply = apply;
    return module.exports;
  }
});
`

await mkdir(new URL('lib', import.meta.url), { recursive: true })
await writeFile(new URL('lib/index.js', import.meta.url), host)
await writeFile(new URL('lib/client.js', import.meta.url), client)
console.log('built lib/index.js + lib/client.js')
