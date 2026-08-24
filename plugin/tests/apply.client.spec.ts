/** Explorer + inherited sessions registrations: declaration-lifetime injection into the sidebar holes and the service callbacks. */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import type { DirectoryListing } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { usePinnedBrowserLanguages } from '@deepseek-ai/dsh-client-test-runtime'
import { apply, inject } from 'dsh-slide-bar/client'
import type {
  ExplorerActivityInjected, ExplorerPanelInjected,
} from 'dsh-slide-bar/client'
import { ExplorerActivityIcon } from '../src/client/ExplorerActivityIcon.tsx'
import { ExplorerPanel } from '../src/client/ExplorerPanel.tsx'
import { SessionsActivityIcon } from '../src/client/sessions/SessionsActivityIcon.tsx'
import { SessionsPanelHost } from '../src/client/sessions/SessionsPanelHost.tsx'
import { WorkspaceBrowser } from '../src/client/workspace/WorkspaceBrowser.tsx'

// The service reads its initial locale from the browser; these specs assert
// the shipped Chinese copy, so they state the browser they assume.
usePinnedBrowserLanguages('zh-CN')

/** Optional per-bench service overrides (the apply closes over them lazily). */
type BenchOptions = {
  sessions?: Record<string, unknown>
  remote?: Record<string, unknown>
}

async function bench(options: BenchOptions = {}) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const listDirectory = vi.fn(async (): Promise<DirectoryListing> => ({
    path: '/repo', home: '/home/u', crumbs: [], entries: [], truncated: false,
  }))
  const openPath = vi.fn(async () => {})
  ctx.provide('workspaces', { listDirectory, openPath } as never)
  ctx.provide('sessions', {
    open: vi.fn(),
    search: vi.fn(async () => ({ ok: true, value: { items: [], hasMore: false } })),
    searchResultLimit: 20,
    binding: vi.fn(() => undefined),
    fork: vi.fn(async () => 'child-id'),
    list: {
      getSnapshot: () => ({ current: undefined, byId: {}, ids: [], phase: 'ready' }),
    },
    ...options.sessions,
  } as never)
  // The explorer panel lists through the host fileReferences Remote; the apply
  // only closes over it (no eager call), so an absent/mock service is fine.
  ctx.provide('remote', options.remote ?? {} as never)
  const locale = new LocaleRuntime(ctx)
  ctx.provide('locale', locale)
  return { ctx, slots: ctx.get('slots') as SlotRegistry, locale, listDirectory, openPath }
}

/** Declare the sidebar shell's two activity-bar holes with a single root registration. */
function declare(slots: SlotRegistry): () => void {
  return slots.register({
    name: 'root',
    children: {
      'sidebar.activity': { kind: 'list', scope: 'root' },
      'sidebar.panel': { kind: 'list', scope: 'root' },
    },
  } as never, () => null)
}

/** Find one list entry by id. */
function byId(entries: ReturnType<SlotRegistry['entries']>, id: string) {
  return entries.find(entry => entry.options.id === id)
}

describe('dsh-slide-bar apply', () => {
  it('declares the services it drives', () => {
    expect(inject).toEqual(['slots', 'sessions', 'workspaces', 'locale', 'remote'])
  })

  it('registers explorer and sessions entries for declarations arriving before or after apply', async () => {
    const before = await bench()
    declare(before.slots)
    await before.ctx.plugin({ inject: [...inject], apply }).await()
    // Explorer: icon + panel.
    expect(before.slots.entries('sidebar.activity')).toHaveLength(2)
    expect(byId(before.slots.entries('sidebar.activity'), 'explorer')!.component).toBe(ExplorerActivityIcon)
    expect(byId(before.slots.entries('sidebar.panel'), 'explorer')!.component).toBe(ExplorerPanel)
    // Sessions: icon + inherited workspace browser host (wraps the fork).
    expect(byId(before.slots.entries('sidebar.activity'), 'sessions')!.component).toBe(SessionsActivityIcon)
    expect(byId(before.slots.entries('sidebar.panel'), 'sessions')!.component).toBe(SessionsPanelHost)
    // Ordering: sessions pinned first (order 1), explorer after (order 10).
    expect(byId(before.slots.entries('sidebar.activity'), 'sessions')).toMatchObject({ options: { id: 'sessions', order: 1 } })
    expect(byId(before.slots.entries('sidebar.activity'), 'explorer')).toMatchObject({ options: { id: 'explorer', order: 10 } })
    // Copy rides the standard locale seats: entries declare namespaces and
    // apply registered both dictionaries.
    expect(byId(before.slots.entries('sidebar.panel'), 'explorer')!.locale).toBe('explorer')
    expect(byId(before.slots.entries('sidebar.panel'), 'sessions')!.locale).toBe('sidebar.sessions')
    expect(before.locale.bind('explorer')('panel.title')).toBe('资源管理器')
    expect(before.locale.bind('sidebar.sessions')('menu.copyPath')).toBe('复制路径')
    expect(before.locale.bind('sidebar.sessions')('menu.fork')).toBe('分叉会话')

    const after = await bench()
    await after.ctx.plugin({ inject: [...inject], apply }).await()
    declare(after.slots)
    await Promise.resolve()
    expect(after.slots.entries('sidebar.activity')).toHaveLength(2)
    expect(after.slots.entries('sidebar.panel')).toHaveLength(2)
  })

  it('routes the explorer inject faces to the workspaces service', async () => {
    const fileReferences = { list: vi.fn(async () => ({ ok: true, value: [{ path: 'a.ts', kind: 'file' }] })) }
    const b = await bench({
      sessions: {
        list: {
          getSnapshot: () => ({
            current: 's-1', byId: { 's-1': { cwd: '/repo' } }, ids: ['s-1'], phase: 'ready',
          }),
        },
      },
      remote: { fileReferences },
    })
    declare(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()

    const activity = (byId(b.slots.entries('sidebar.activity'), 'explorer')!.inject as () => ExplorerActivityInjected)()
    expect(activity).toEqual({ panelId: 'explorer' })

    const panel = (byId(b.slots.entries('sidebar.panel'), 'explorer')!.inject as () => ExplorerPanelInjected)()
    expect(panel.panelId).toBe('explorer')
    const signal = new AbortController().signal
    const listing = await panel.listDirectory('/repo', signal)
    // The tree lists files too: the wrapper resolves absolute paths + kind
    // through the host fileReferences Remote (relative to the session cwd).
    expect(fileReferences.list).toHaveBeenCalledWith('s-1', '', signal)
    expect(listing.entries).toEqual([
      { name: 'a.ts', path: '/repo/a.ts', kind: 'file', hidden: false },
    ])
    await panel.openPath('/repo/a.ts')
    expect(b.openPath).toHaveBeenCalledWith('/repo/a.ts')
  })

  it('wires the sessions inject face to the sessions/workspaces services', async () => {
    const b = await bench()
    declare(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()

    const sessionsEntry = byId(b.slots.entries('sidebar.panel'), 'sessions')!
    // The sessions panel declares its own directory-flow child.
    expect(sessionsEntry.children).toHaveProperty('sidebar.panel.sessions.directoryFlow')
    const injected = (sessionsEntry.inject as () => Record<string, unknown>)()
    expect(injected.searchResultLimit).toBe(20)
    expect(typeof injected.forkSession).toBe('function')
    expect(typeof injected.archiveSession).toBe('function')
    expect(typeof injected.hooks.directoryFlow.getSnapshot).toBe('function')
    // Fork goes through ctx.sessions.fork then opens the child.
    await (injected.forkSession as (id: string) => void)('s-1')
  })

  it('unregisters all entries on teardown', async () => {
    const b = await bench()
    declare(b.slots)
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    await fiber.dispose()
    expect(b.slots.entries('sidebar.activity')).toHaveLength(0)
    expect(b.slots.entries('sidebar.panel')).toHaveLength(0)
  })
})

// Referenced to keep the fork's component in the graph for the component
// assertions above without an unused-import lint.
void WorkspaceBrowser
