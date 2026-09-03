/**
 * dsh-sidebar-live host half.
 *
 * Pure-UI plugin plus the package-private loopback RPC channel `/preview-fs`
 * serving the browser half: one directory level (files + dirs), file preview
 * content (UTF-8 text, or base64 image payload) over the `fs` service, and
 * the explorer row's "Reveal in Finder" verb (platform file-manager reveal).
 * The browser half calls the channel with plain fetch using the same message
 * shape as the connection rpc caller (see dsh-client-connection
 * createWebConnectionRpc), so no typert/Remote codegen is required.
 */

import { spawn } from 'node:child_process'
import { dirname } from 'node:path'

/**
 * Reveal a path in the host's file manager (Finder / Explorer), selecting the
 * entry itself where the platform supports it; Linux has no standard select
 * verb, so the containing folder is opened instead. Spawned without a shell:
 * the path travels as one argv element and cannot smuggle a command.
 * @param {string} path - absolute host path (already existence-checked).
 * @returns {Promise<void>} resolves when the platform command was spawned.
 */
function revealInFileManager(path) {
  const platform = process.platform
  let command
  let args
  if (platform === 'darwin') {
    command = 'open'
    args = ['-R', path]
  } else if (platform === 'win32') {
    command = 'explorer.exe'
    args = ['/select,' + path]
  } else if (platform === 'linux') {
    command = 'xdg-open'
    args = [dirname(path)]
  } else {
    return Promise.reject(new Error('当前平台不支持在文件管理器中显示'))
  }
  return new Promise((resolve, reject) => {
    let child
    try {
      child = spawn(command, args, { stdio: 'ignore', detached: true })
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)))
      return
    }
    child.once('error', (err) => { reject(err) })
    // explorer.exe exits non-zero on a successful /select,, and the reveal is
    // fire-and-forget either way: unref and report success once spawned.
    child.once('spawn', () => { child.unref(); resolve() })
  })
}

export function apply(ctx) {
  const errorText = (err) => (err && err.message ? String(err.message) : String(err))

  const MAX_ENTRIES = 500
  const TEXT_CAP = 1_000_000
  const IMG_CAP = 4_000_000

  const IMG_EXT = {
    png: 1, jpg: 1, jpeg: 1, gif: 1, webp: 1, bmp: 1, svg: 1, ico: 1, avif: 1,
  }
  const IMG_MIME = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
    webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml',
    ico: 'image/x-icon', avif: 'image/avif',
  }
  const TEXT_EXT = {
    md: 1, markdown: 1, mdx: 1, yaml: 1, yml: 1, json: 1, toml: 1,
    txt: 1, text: 1, log: 1, csv: 1, tsv: 1, ini: 1, conf: 1, cfg: 1, env: 1,
    lock: 1, gitignore: 1, editorconfig: 1, dockerfile: 1, makefile: 1,
    ts: 1, tsx: 1, js: 1, jsx: 1, mjs: 1, cjs: 1, py: 1, rb: 1, go: 1, rs: 1,
    java: 1, kt: 1, swift: 1, c: 1, h: 1, cpp: 1, hpp: 1, cc: 1,
    css: 1, scss: 1, less: 1, html: 1, htm: 1, xml: 1,
    sh: 1, bash: 1, zsh: 1, fish: 1, sql: 1, graphql: 1, proto: 1,
    vue: 1, svelte: 1, gradle: 1,
  }

  ctx.inject(['connection'], (apiCtx) => {
    return apiCtx.connection.rpc.handle('/preview-fs', async (endpoint, payload, _signal) => {
      // Read fs lazily per call: at plugin apply time the fs service may not
      // be mounted yet, and reading it early would freeze it as undefined.
      const fs = ctx.get('fs')
      if (fs === undefined) return { ok: false, error: '文件系统服务不可用' }
      if (endpoint === 'list-directory') {
        const path = payload && typeof payload.path === 'string' ? payload.path : ''
        if (path === '') return { ok: false, error: '未提供目录路径' }
        let target
        try {
          target = await fs.resolve(path)
        } catch (err) {
          return { ok: false, error: errorText(err) }
        }
        let raw
        try {
          raw = await fs.listDir(target)
        } catch (err) {
          return { ok: false, error: errorText(err) }
        }
        const entries = []
        for (const e of raw) {
          if (e.type !== 'file' && e.type !== 'directory') continue
          entries.push({
            name: e.name,
            path: (e.target && e.target.displayPath) || e.name,
            kind: e.type,
            hidden: e.name.charAt(0) === '.',
          })
        }
        entries.sort((a, b) => {
          if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1
          if (a.name < b.name) return -1
          if (a.name > b.name) return 1
          return 0
        })
        const truncated = entries.length > MAX_ENTRIES
        return {
          ok: true,
          path: (target && target.displayPath) || path,
          entries: truncated ? entries.slice(0, MAX_ENTRIES) : entries,
          truncated,
        }
      }
      if (endpoint === 'read-file') {
        if (fs === undefined) return { ok: false, error: '文件系统服务不可用' }
        const path = payload && typeof payload.path === 'string' ? payload.path : ''
        if (path === '') return { ok: false, error: '未提供文件路径' }
        const ext = (path.split('.').pop() || '').toLowerCase()
        const isImage = IMG_EXT[ext] === 1
        const isText = !isImage && TEXT_EXT[ext] === 1
        if (!isImage && !isText) return { ok: false, error: '暂不支持预览该格式' }
        let target
        try {
          target = await fs.resolve(path)
        } catch (err) {
          return { ok: false, error: errorText(err) }
        }
        try {
          if (isImage) {
            const bytes = await fs.readBytes(target, undefined, IMG_CAP)
            // btoa only encodes UTF-8 text; decode the raw bytes as latin1 so
            // each byte maps to the same char code, then base64 the result.
            const b64 = btoa(new TextDecoder('latin1').decode(bytes))
            return {
              ok: true,
              kind: 'image',
              mime: IMG_MIME[ext] || 'application/octet-stream',
              data: b64,
              bytes: bytes.length,
            }
          }
          const bytes = await fs.readBytes(target, undefined, TEXT_CAP)
          const text = new TextDecoder('utf-8').decode(bytes)
          return { ok: true, kind: 'text', ext, text, bytes: bytes.length }
        } catch (err) {
          const msg = errorText(err)
          if (/too[ _-]?large/i.test(msg)) {
            return { ok: false, error: '文件过大，无法在应用内预览，请在外部打开' }
          }
          return { ok: false, error: msg }
        }
      }
      if (endpoint === 'reveal-path') {
        // Explorer row "在 Finder 中显示": existence-check through the fs
        // service first so a stale row answers with a readable error, then
        // hand the path to the platform file manager's reveal verb.
        const path = payload && typeof payload.path === 'string' ? payload.path : ''
        if (path === '') return { ok: false, error: '未提供文件路径' }
        let target
        try {
          target = await fs.resolve(path)
        } catch (err) {
          return { ok: false, error: errorText(err) }
        }
        try {
          await revealInFileManager((target && target.displayPath) || path)
        } catch (err) {
          return { ok: false, error: errorText(err) }
        }
        return { ok: true, path: (target && target.displayPath) || path }
      }
      return { ok: false, error: 'unknown preview endpoint: ' + String(endpoint) }
    }, { authority: 'loopback' })
  })
}
