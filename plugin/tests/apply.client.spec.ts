/** Inherited sessions registrations: declaration-lifetime injection into the sidebar holes and the service callbacks. */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import type { DirectoryListing } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { usePinnedBrowserLanguages } from '@deepseek-ai/dsh-client-test-runtime'
import { apply, inject } from 'dsh-slide-bar/client'
import { SessionsActivityIcon } from '../src/client/sessions/SessionsActivityIcon.tsx'
import { SessionsPanelHost } from '../src/client/sessions/SessionsPanelHost.tsx'
import { WorkspaceBrowser } from '../src/client/workspace/WorkspaceBrowser.tsx'

// The service reads its initial locale from the browser; these specs assert
// the shipped Chinese copy, so they state the browser they assume.
usePinnedBrowserLanguages('zh-CN')

/** Optional per-bench service overrides (the apply closes over them lazily). */
type BenchOptions = {
  sessions?: Record<string, unknown>
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
    expect(inject).toEqual(['slots', 'sessions', 'workspaces', 'locale'])
  })

  it('registers the sessions entries for declarations arriving before or after apply', async () => {
    const before = await bench()
    declare(before.slots)
    await before.ctx.plugin({ inject: [...inject], apply }).await()
    // Sessions: icon + inherited workspace browser host (wraps the fork).
    expect(byId(before.slots.entries('sidebar.activity'), 'sessions')!.component).toBe(SessionsActivityIcon)
    expect(byId(before.slots.entries('sidebar.panel'), 'sessions')!.component).toBe(SessionsPanelHost)
    expect(before.slots.entries('sidebar.activity')).toHaveLength(1)
    expect(before.slots.entries('sidebar.panel')).toHaveLength(1)
    expect(byId(before.slots.entries('sidebar.activity'), 'sessions')).toMatchObject({ options: { id: 'sessions', order: 1, priority: -2 } })
    // Copy rides the standard locale seats: the entry declares the namespace
    // and apply registered the dictionary.
    expect(byId(before.slots.entries('sidebar.panel'), 'sessions')!.locale).toBe('sidebar.sessions')
    expect(before.locale.bind('sidebar.sessions')('menu.copyPath')).toBe('复制路径')
    expect(before.locale.bind('sidebar.sessions')('menu.fork')).toBe('分叉会话')

    const after = await bench()
    await after.ctx.plugin({ inject: [...inject], apply }).await()
    declare(after.slots)
    await Promise.resolve()
    expect(after.slots.entries('sidebar.activity')).toHaveLength(1)
    expect(after.slots.entries('sidebar.panel')).toHaveLength(1)
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
