// dsh-sidebar-live build: produces lib/index.js (host empty apply, ESM) and
// lib/client.js (browser bundle in the dsh closure-factory format) without
// any toolchain — plain JS only.
//
// The client source (src/client/index.js) is a module-scope body that defines
// `apply` plus helpers and references the `React` and `builtinBrowser` closure
// symbols; the wrapper below binds React from the loader module table and the
// browser core from the dsh-builtin-browser client bundle (the shared engine:
// browserStore / pageBrowserController / pick flow — see dsh-builtin-browser's
// client exports), then exports apply, exactly like the tsdown-built bundles.
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
    // The browser core (dsh-builtin-browser/client) is NOT required here at
    // materialization time: client entries boot in parallel, so a sync require
    // can race the core's registration and fail the whole boot. Instead apply()
    // resolves it through the async modules import (which arrives the graph
    // row first) and assigns these module-level bindings before any view
    // renders. Components reference the same free identifiers as before.
    let browserStore, pageBrowserController, BLANK_PAGE, setOpenHandler, togglePicking, stopPicking;
${clientSrc}
    // Declared service deps: the web frontend's ctx guard throws "cannot get
    // property ... without inject" on any service property access unless the
    // bundle declares them; Remote sub-services must be named by FULL key
    // (mirrors the TS plugin: 'remote.fileReferences'). 'modules' is needed
    // for the async core import in apply().
    exports.inject = ['slots', 'modules', 'remote', 'remote.fileReferences', 'workspaces', 'sessions', 'conversation'];
    exports.apply = apply;
    return module.exports;
  }
});
`

await mkdir(new URL('lib', import.meta.url), { recursive: true })
await writeFile(new URL('lib/index.js', import.meta.url), hostSrc)
await writeFile(new URL('lib/client.js', import.meta.url), client)
console.log('built lib/index.js + lib/client.js')
