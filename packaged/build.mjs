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

// Host half is source-verbatim (plain ESM): registers the /preview-fs RPC
// channel over ctx.inject(['connection']).
const hostSrc = await readFile(new URL('src/index.js', import.meta.url), 'utf8')

const clientSrc = await readFile(new URL('src/client/index.js', import.meta.url), 'utf8')
const client = `window.__ModuleLoader__.load({
  id: ${JSON.stringify(PACKAGE_ID)},
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
    const React = require('react');
${clientSrc}
    // Declared service deps: the web frontend's ctx guard throws "cannot get
    // property ... without inject" on any service property access unless the
    // bundle declares them; Remote sub-services must be named by FULL key
    // (mirrors the TS plugin: 'remote.fileReferences').
    exports.inject = ['slots', 'remote', 'remote.fileReferences', 'workspaces', 'sessions', 'conversation'];
    exports.apply = apply;
    return module.exports;
  }
});
`

await mkdir(new URL('lib', import.meta.url), { recursive: true })
await writeFile(new URL('lib/index.js', import.meta.url), hostSrc)
await writeFile(new URL('lib/client.js', import.meta.url), client)
console.log('built lib/index.js + lib/client.js')
