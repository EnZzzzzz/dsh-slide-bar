/** Explorer slot registration: declaration-lifetime injection into the sidebar holes and the plain workspace-service callbacks. */
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

// The service reads its initial locale from the browser; these specs assert
// the shipped Chinese copy, so they state the browser they assume.
usePinnedBrowserLanguages('zh-CN')

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const listDirectory = vi.fn(async (): Promise<DirectoryListing> => ({
    path: '/repo', home: '/home/u', crumbs: [], entries: [], truncated: false,
  }))
  const openPath = vi.fn(async () => {})
  ctx.provide('workspaces', { listDirectory, openPath } as never)
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

describe('ui-explorer apply', () => {
  it('declares the services it drives', () => {
    expect(inject).toEqual(['slots', 'workspaces', 'locale'])
  })

  it('registers the activity icon and panel for declarations arriving before or after apply', async () => {
    const before = await bench()
    declare(before.slots)
    await before.ctx.plugin({ inject: [...inject], apply }).await()
    expect(before.slots.entries('sidebar.activity')).toHaveLength(1)
    expect(before.slots.entries('sidebar.activity')[0]!.component).toBe(ExplorerActivityIcon)
    expect(before.slots.entries('sidebar.panel')[0]!.component).toBe(ExplorerPanel)
    // Both registrations carry the panel id as their entry id, ordered after
    // nothing built-in (the shell pins its own Sessions icon ahead).
    expect(before.slots.entries('sidebar.activity')[0]).toMatchObject({ options: { id: 'explorer', order: 10 } })
    expect(before.slots.entries('sidebar.panel')[0]).toMatchObject({ options: { id: 'explorer', order: 10 } })
    // Copy rides the standard locale seat: the entries declare the namespace
    // and apply registered both dictionaries.
    expect(before.slots.entries('sidebar.panel')[0]!.locale).toBe('explorer')
    expect(before.locale.bind('explorer')('panel.title')).toBe('资源管理器')

    const after = await bench()
    await after.ctx.plugin({ inject: [...inject], apply }).await()
    declare(after.slots)
    await Promise.resolve()
    expect(after.slots.entries('sidebar.activity')).toHaveLength(1)
    expect(after.slots.entries('sidebar.panel')).toHaveLength(1)
  })

  it('routes the inject faces to the workspaces service', async () => {
    const b = await bench()
    declare(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()

    const activity = (b.slots.entries('sidebar.activity')[0]!.inject as () => ExplorerActivityInjected)()
    expect(activity).toEqual({ panelId: 'explorer' })

    const panel = (b.slots.entries('sidebar.panel')[0]!.inject as () => ExplorerPanelInjected)()
    expect(panel.panelId).toBe('explorer')
    const signal = new AbortController().signal
    await panel.listDirectory('/repo/src', signal)
    // The tree lists files too: the wrapper fixes includeFiles on every call.
    expect(b.listDirectory).toHaveBeenCalledWith('/repo/src', { includeFiles: true }, signal)
    await panel.openPath('/repo/a.ts')
    expect(b.openPath).toHaveBeenCalledWith('/repo/a.ts')
  })

  it('unregisters both entries on teardown', async () => {
    const b = await bench()
    declare(b.slots)
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    await fiber.dispose()
    expect(b.slots.entries('sidebar.activity')).toHaveLength(0)
    expect(b.slots.entries('sidebar.panel')).toHaveLength(0)
  })
})
