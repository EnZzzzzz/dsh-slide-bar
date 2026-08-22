// dsh-slide-bar — runtime plugin Host half.
// Self-contained directory listing over the host `fs` service, reached from the
// Client half through the Package-private `host.call('list-directory', ...)` RPC.
//
// This file is the exact `code.host` body handed to cordis_define. Plain JS only:
// no imports, no TypeScript. `ctx` / `harness` / `console` are harness Builtins.

return {
  apply(ctx) {
    // Directories and files cap per level; beyond it the level is truncated.
    const MAX_ENTRIES = 500

    // The `fs` service is optional: read it with an undefined check (never ctx.fs
    // without declaring an inject dependency).
    const fs = ctx.get('fs')

    const errorText = (err) => (err && err.message ? String(err.message) : String(err))

    // Package-private RPC: list one directory level, files included, sorted
    // directories-first then name. `fs` is backend-agnostic (local, sandboxed,
    // or remote), so the same code answers under any deployment shape.
    harness.handle('list-directory', async (args) => {
      if (fs === undefined) {
        return { ok: false, error: '文件系统服务不可用' }
      }
      const path = args && typeof args.path === 'string' ? args.path : ''
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
    })
  },
}
