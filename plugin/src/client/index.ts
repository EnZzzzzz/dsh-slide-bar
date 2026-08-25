/**
 * Inherited sessions panel plugin, browser half.
 *
 * This package registers one panel group into the sidebar shell's
 * activity-bar holes (sidebar.activity / sidebar.panel, declared by the
 * shell's sidebar entry):
 *
 * - sessions: SessionsActivityIcon + SessionsPanelHost, which renders the
 *   workspace browser FORKED from @deepseek-ai/dsh-client-ui-workspace (the
 *   original dsh session panel: search, grouped/flat list, drag reorder,
 *   workspace/session rename, fork, archive, and — fork-added — 「复制路径」on
 *   folder rows). See plugin/README.md「继承原版会话面板」.
 *
 * The explorer panel lives in the packaged dsh-sidebar-live bundle (priority
 * −1, with file preview + built-in browser). This sessions panel registers at
 * priority −2 (lowest renders), shadowing dsh-sidebar-live's own lightweight
 * sessions panel so the original full sessions panel takes over.
 *
 * The target slots are declared by the shell; activation order relative to
 * this package is NOT constrained, so registration follows each declaration
 * through `slots.inject()`.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
// Inherited original session panel (fork of @deepseek-ai/dsh-client-ui-workspace).
import type { WorkspaceBrowserInjected } from './workspace/contract/slots.ts'
import { createWorkspaceViewStore } from './workspace/stores.ts'
import { en as workspaceEn, zh as workspaceZh } from './workspace/locales.ts'
import { SessionsActivityIcon } from './sessions/SessionsActivityIcon.tsx'
import type { SidebarActivityInjected } from './sessions/contract.ts'
import { SessionsPanelHost } from './sessions/SessionsPanelHost.tsx'

/** Dictionary namespace owned by this package for the inherited sessions panel. */
const SESSIONS_NS = 'sidebar.sessions'

/** The sessions panel id both sessions registrations carry. */
const SESSIONS_PANEL_ID = 'sessions'

/** Services required by this plugin. */
export const inject = ['slots', 'sessions', 'workspaces', 'locale']

/**
 * Register the sessions activity icon + inherited panel once their slot
 * declarations are on the ledger. The sessions inject face mirrors the
 * original ui-workspace apply (thin ctx.sessions / ctx.workspaces closures).
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(SESSIONS_NS, { zh: workspaceZh, en: workspaceEn }), 'ui-sessions: dictionaries')

  // Occupancy source for the sessions panel's directory-flow hole: true while
  // the fork's own directory-flow slot holds an entry (same shape as the
  // original browserInjected flowSource).
  const sessionsFlowSource = ((): HostObservable<boolean> => ({
    getSnapshot: () => ctx.slots.entries('sidebar.panel.sessions.directoryFlow').length > 0,
    subscribe: listener => ctx.slots.subscribe('sidebar.panel.sessions.directoryFlow', listener),
  }))()

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
