/**
 * File explorer + inherited sessions panel plugin, browser half.
 *
 * Two panel groups register into the sidebar shell's activity-bar holes
 * (sidebar.activity / sidebar.panel, declared by the shell's sidebar entry):
 *
 * - explorer: ExplorerActivityIcon + ExplorerPanel (the self-gated file tree).
 * - sessions: SessionsActivityIcon + SessionsPanelHost, which renders the
 *   workspace browser FORKED from @deepseek-ai/dsh-client-ui-workspace (the
 *   original dsh session panel: search, grouped/flat list, drag reorder,
 *   workspace/session rename, fork, archive, and — fork-added — 「复制路径」on
 *   folder rows). See plugin/README.md「继承原版会话面板」.
 *
 * Both target slots are declared by the shell; activation order relative to
 * this package is NOT constrained, so registration follows each declaration
 * through `slots.inject()`.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { ExplorerActivityInjected, ExplorerPanelInjected } from './contract/slots.ts'
import type { FileReferencesRemote } from './contract/slots.ts'
import { createExplorerStore } from './stores.ts'
import { ExplorerActivityIcon } from './ExplorerActivityIcon.tsx'
import { ExplorerPanel } from './ExplorerPanel.tsx'
import { en, zh } from './locales.ts'
// Inherited original session panel (fork of @deepseek-ai/dsh-client-ui-workspace).
import type { WorkspaceBrowserInjected } from './workspace/contract/slots.ts'
import { createWorkspaceViewStore } from './workspace/stores.ts'
import { en as workspaceEn, zh as workspaceZh } from './workspace/locales.ts'
import { SessionsActivityIcon } from './sessions/SessionsActivityIcon.tsx'
import type { SidebarActivityInjected } from './sessions/contract.ts'
import { SessionsPanelHost } from './sessions/SessionsPanelHost.tsx'

export type {
  ExplorerActivityIconProps, ExplorerActivityInjected, ExplorerPanelInjected, ExplorerPanelProps,
} from './contract/slots.ts'
export type { ExplorerKey } from './locales.ts'

/** Dictionary namespace owned by this package for the explorer panel. */
const NS = 'explorer'
/** Dictionary namespace owned by this package for the inherited sessions panel. */
const SESSIONS_NS = 'sidebar.sessions'

/** The explorer panel id both explorer registrations carry. */
const EXPLORER_PANEL_ID = 'explorer'
/** The sessions panel id both sessions registrations carry. */
const SESSIONS_PANEL_ID = 'sessions'

/** Services required by this plugin. */
export const inject = ['slots', 'sessions', 'workspaces', 'locale', 'remote']

/**
 * Join a relative fileReferences path onto the cwd root ('' = the root
 * itself). Mirrors the packaged explorer's joinAbs.
 * @param root - absolute cwd root.
 * @param rel - relative path from fileReferences ('' or a sub path).
 * @returns the absolute path.
 */
function joinAbs(root: string | undefined, rel: string): string {
  if (typeof rel !== 'string' || rel === '') return root || ''
  return (root || '').replace(/[/\\]+$/, '') + '/' + rel
}

/**
 * Register the activity icons and panels once their slot declarations are on
 * the ledger. The explorer listing wrapper fixes `includeFiles: true`; the
 * sessions inject face mirrors the original ui-workspace apply (thin
 * ctx.sessions / ctx.workspaces closures).
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-explorer: dictionaries')
  ctx.effect(() => ctx.locale.register(SESSIONS_NS, { zh: workspaceZh, en: workspaceEn }), 'ui-sessions: dictionaries')

  // Occupancy source for the sessions panel's directory-flow hole: true while
  // the fork's own directory-flow slot holds an entry (same shape as the
  // original browserInjected flowSource).
  const sessionsFlowSource = ((): HostObservable<boolean> => ({
    getSnapshot: () => ctx.slots.entries('sidebar.panel.sessions.directoryFlow').length > 0,
    subscribe: listener => ctx.slots.subscribe('sidebar.panel.sessions.directoryFlow', listener),
  }))()

  // Explorer directory listing over the host fileReferences Remote (relative
  // paths + kind, files included) — the same data source the packaged sidebar
  // uses. ctx.workspaces.listDirectory returns no `kind` and directories
  // only, so it cannot drive a file tree; passing an options bag there also
  // landed in the signal slot and crashed AbortSignal.any in the RPC layer.
  const explorerListDirectory = async (path: string, signal: AbortSignal): Promise<{
    path: string
    entries: Array<{ name: string; path: string; kind: 'file' | 'directory'; hidden: boolean }>
    truncated: boolean
  }> => {
    const remote = ctx.get('remote') as { fileReferences?: FileReferencesRemote } | undefined
    if (!remote || !remote.fileReferences || typeof remote.fileReferences.list !== 'function') {
      throw new Error('文件引用服务不可用')
    }
    const sessionsSvc = ctx.get('sessions')
    const snapshot = sessionsSvc && typeof sessionsSvc.list?.getSnapshot === 'function'
      ? sessionsSvc.list.getSnapshot()
      : undefined
    const sessionId = snapshot && typeof snapshot.current === 'string' ? snapshot.current : undefined
    const cwd = sessionId === undefined || !snapshot || !snapshot.byId[sessionId]
      ? undefined
      : snapshot.byId[sessionId].cwd
    if (cwd === undefined) throw new Error('没有可用的会话工作目录')
    if (sessionId === undefined) throw new Error('没有可用的会话')
    const rel = path === cwd ? '' : (path.startsWith(cwd + '/') ? path.slice(cwd.length + 1) : path)
    const query = rel === '' ? '' : rel + '/'
    const result = await remote.fileReferences.list(sessionId, query, signal)
    if (signal && signal.aborted) throw new Error('已取消')
    if (!result || result.ok !== true) {
      const msg = result && result.error ? (result.error.message || String(result.error)) : '目录读取失败'
      throw new Error(msg)
    }
    const items = result.value || []
    return {
      path: path || cwd,
      truncated: false,
      entries: items.map((c: { path: string; kind: 'file' | 'directory' }) => ({
        name: c.path.slice(c.path.lastIndexOf('/') + 1),
        path: joinAbs(cwd, c.path),
        kind: c.kind,
        hidden: false,
      })),
    }
  }

  const sessionsInjected = (): WorkspaceBrowserInjected => ({
    startSession: (workspaceId) => { ctx.workspaces.startSession(workspaceId) },
    open: (sessionId) => { ctx.sessions.open(sessionId) },
    searchSessions: async (query, signal) => {
      const result = await ctx.sessions.search(query, signal)
      if (!result.ok) throw new Error(result.error.message)
      return result.value
    },
    searchResultLimit: ctx.sessions.searchResultLimit,
    renameSession: async (sessionId, title) => {
      const session = ctx.sessions.binding(sessionId)?.session
      if (session === undefined) throw new Error(`unknown session "${sessionId}"`)
      const result = await session.rename(title)
      if (!result.ok) throw new Error(result.error.message)
    },
    forkSession: (sessionId) => {
      ctx.sessions.fork({ sessionId, increaseTitle: true })
        .then((childId) => { ctx.sessions.open(childId) })
        .catch(() => {
          // Fork or child-rename failure keeps the current selection.
        })
    },
    renameWorkspace: async (workspaceId, title) => { await ctx.workspaces.rename(workspaceId, title) },
    deleteWorkspace: async (workspaceId) => { await ctx.workspaces.delete(workspaceId) },
    insertWorkspaceBefore: async (workspaceId, beforeWorkspaceId) => {
      await ctx.workspaces.insertBefore(workspaceId, beforeWorkspaceId)
    },
    archiveSession: async (sessionId) => { await ctx.workspaces.archiveSession(sessionId) },
    insertSessionBefore: async (workspaceId, sessionId, beforeSessionId) => {
      await ctx.workspaces.insertSessionBefore(workspaceId, sessionId, beforeSessionId)
    },
    createWorkspace: input => ctx.workspaces.create(input),
    hooks: { directoryFlow: sessionsFlowSource },
  })

  ctx.slots.inject('sidebar.activity', () => ctx.slots.register(
    {
      name: 'sidebar.activity',
      id: EXPLORER_PANEL_ID,
      order: 10,
      locale: NS,
      inject: (): ExplorerActivityInjected => ({ panelId: EXPLORER_PANEL_ID }),
    },
    ExplorerActivityIcon,
  ))
  ctx.slots.inject('sidebar.panel', () => ctx.slots.register(
    {
      name: 'sidebar.panel',
      id: EXPLORER_PANEL_ID,
      order: 10,
      store: createExplorerStore(),
      locale: NS,
      inject: (): ExplorerPanelInjected => ({
        panelId: EXPLORER_PANEL_ID,
        listDirectory: explorerListDirectory,
        openPath: path => ctx.workspaces.openPath(path),
      }),
    },
    ExplorerPanel,
  ))

  ctx.slots.inject('sidebar.activity', () => ctx.slots.register(
    {
      name: 'sidebar.activity',
      id: SESSIONS_PANEL_ID,
      order: 1,
      priority: -2,
      locale: SESSIONS_NS,
      inject: (): SidebarActivityInjected => ({ panelId: SESSIONS_PANEL_ID }),
    },
    SessionsActivityIcon,
  ))
  ctx.slots.inject('sidebar.panel', () => ctx.slots.register(
    {
      name: 'sidebar.panel',
      id: SESSIONS_PANEL_ID,
      order: 1,
      priority: -2,
      children: {
        'sidebar.panel.sessions.directoryFlow': { kind: 'single', scope: 'root' },
      },
      store: createWorkspaceViewStore(),
      locale: SESSIONS_NS,
      inject: sessionsInjected,
    },
    SessionsPanelHost,
  ))
}
