// @vitest-environment jsdom
/**
 * ExplorerPanel behavior: self-gating, root derivation, lazy tree loading,
 * inline status affordances, and the header actions. Props are fed directly
 * (the store via createExplorerStore().create(), framework hooks as plain
 * stubs) per the client testing discipline.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-web-react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type {
  DirectoryEntry, DirectoryListing, SessionListState, WorkspaceListState, WorkspaceView,
} from '@deepseek-ai/dsh-client-runtime/client'
import type { ExplorerPanelProps } from '../src/client/contract/slots.ts'
import { deriveRootPath, ExplorerPanel } from '../src/client/ExplorerPanel.tsx'
import { createExplorerStore } from '../src/client/stores.ts'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)
beforeEach(() => { localStorage.clear() })

const t: ExplorerPanelProps['t'] = makeTranslate(zh)

const dir = (path: string, hidden = false): DirectoryEntry => ({
  name: path.slice(path.lastIndexOf('/') + 1), path, hidden, kind: 'directory',
})
const file = (path: string, hidden = false): DirectoryEntry => ({
  name: path.slice(path.lastIndexOf('/') + 1), path, hidden, kind: 'file',
})
const listing = (path: string, entries: DirectoryEntry[], truncated = false): DirectoryListing => ({
  path, home: '/home/u', crumbs: [], entries, truncated,
})

function sessionsState(current?: { id: string; cwd?: string }): SessionListState {
  return {
    ids: (current === undefined ? [] : [current.id]),
    byId: current === undefined ? {} : { [current.id]: { sessionId: current.id, cwd: current.cwd } },
    current: current?.id,
    phase: 'ready',
    subagentsByParent: {},
    jobsBySession: {},
    currentAddress: undefined,
  } as never
}

function workspacesState(overrides: Partial<WorkspaceListState> = {}): WorkspaceListState {
  return {
    items: [], archivedSessionIds: [], state: 'idle', phase: 'ready', error: null,
    baselinesReady: true, recentWorkspaceId: undefined, ...overrides,
  }
}

const workspace = (id: string, path: string): WorkspaceView => ({
  workspaceId: id, path, title: id, sessionIds: [], createdAt: '0', updatedAt: '0',
} as never)

/** Plain stub of a framework hook over a fixed snapshot. */
function hook<T>(snapshot: T) {
  return function select<S>(selector: (state: T) => S): S { return selector(snapshot) }
}

/** A promise the test settles by hand (in-flight request control). */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

/** listDirectory stub routing per path; missing paths reject like the Host's directory-unreadable. */
function listingStub(listings: Record<string, DirectoryListing>) {
  return vi.fn(async (path: string): Promise<DirectoryListing> => {
    const found = listings[path]
    if (found === undefined) throw new Error(`directory-unreadable: ${path}`)
    return found
  })
}

function mountPanel({
  sessions = sessionsState({ id: 's1', cwd: '/repo' }),
  workspaces = workspacesState(),
  listDirectory = listingStub({}),
  openPath = vi.fn(async () => {}),
  activePanelId = 'explorer',
}: {
  sessions?: SessionListState
  workspaces?: WorkspaceListState
  listDirectory?: ExplorerPanelProps['listDirectory']
  openPath?: ExplorerPanelProps['openPath']
  activePanelId?: string
} = {}) {
  const store = createExplorerStore().create()
  const view = render(
    <ExplorerPanel
      wide
      activePanelId={activePanelId}
      expandSidebar={vi.fn()}
      panelId="explorer"
      useSessions={hook(sessions)}
      useWorkspaces={hook(workspaces)}
      useStore={bindSnapshotSelector(store)}
      actions={store.actions}
      listDirectory={listDirectory}
      openPath={openPath}
      t={t}
    />,
  )
  return { store, view, listDirectory, openPath }
}

describe('deriveRootPath', () => {
  it('prefers the current session cwd, then the recent workspace path, else nothing', () => {
    const recent = workspacesState({
      items: [workspace('w1', '/ws/one')], recentWorkspaceId: 'w1' as never,
    })
    expect(deriveRootPath(sessionsState({ id: 's1', cwd: '/repo' }), recent)).toBe('/repo')
    expect(deriveRootPath(sessionsState({ id: 's1' }), recent)).toBe('/ws/one')
    expect(deriveRootPath(sessionsState(), recent)).toBe('/ws/one')
    expect(deriveRootPath(sessionsState(), workspacesState())).toBeUndefined()
    // A recentWorkspaceId naming no listed workspace is no root either.
    expect(deriveRootPath(sessionsState(), workspacesState({ recentWorkspaceId: 'gone' as never })))
      .toBeUndefined()
  })
})

describe('ExplorerPanel gating and root', () => {
  it('renders null while another panel is active and fetches nothing', () => {
    const b = mountPanel({ activePanelId: 'workspaces' })
    expect(b.view.container.firstChild).toBeNull()
    expect(b.listDirectory).not.toHaveBeenCalled()
  })

  it('shows a loading placeholder until the baselines are ready', () => {
    const b = mountPanel({ workspaces: workspacesState({ baselinesReady: false }) })
    expect(screen.getByText('正在加载…')).toBeTruthy()
    expect(b.listDirectory).not.toHaveBeenCalled()
  })

  it('shows the empty state with guidance when no root can be derived', () => {
    mountPanel({ sessions: sessionsState(), workspaces: workspacesState() })
    expect(screen.getByText('没有可用的工作区')).toBeTruthy()
    expect(screen.getByText('打开或新建一个会话后，这里会显示其工作目录。')).toBeTruthy()
  })

  it('roots the tree at the current session cwd and lists it on mount', async () => {
    const b = mountPanel({
      listDirectory: listingStub({
        '/repo': listing('/repo', [dir('/repo/src'), file('/repo/a.ts'), file('/repo/.env', true)]),
      }),
    })
    expect(await screen.findByText('src')).toBeTruthy()
    expect(screen.getByText('a.ts')).toBeTruthy()
    // Hidden entries stay out until toggled on; the Host's order is kept.
    expect(screen.queryByText('.env')).toBeNull()
    expect(b.listDirectory).toHaveBeenCalledWith('/repo', expect.any(AbortSignal))
  })

  it('falls back to the recent workspace path without a current session', async () => {
    const b = mountPanel({
      sessions: sessionsState(),
      workspaces: workspacesState({ items: [workspace('w1', '/ws/one')], recentWorkspaceId: 'w1' as never }),
      listDirectory: listingStub({ '/ws/one': listing('/ws/one', [file('/ws/one/README.md')]) }),
    })
    expect(await screen.findByText('README.md')).toBeTruthy()
    expect(b.listDirectory).toHaveBeenCalledWith('/ws/one', expect.any(AbortSignal))
  })
})

describe('ExplorerPanel tree interaction', () => {
  const listings = () => ({
    '/repo': listing('/repo', [dir('/repo/src'), file('/repo/a.ts')]),
    '/repo/src': listing('/repo/src', [file('/repo/src/index.ts')], true),
  })

  it('expands a directory by fetching one level, and collapses without refetching', async () => {
    const b = mountPanel({ listDirectory: listingStub(listings()) })
    fireEvent.click(await screen.findByText('src'))
    expect(await screen.findByText('index.ts')).toBeTruthy()
    expect(b.store.getSnapshot().expansion).toEqual({ '/repo/src': true })
    // The subdirectory listing was truncated at the Host's complete-result bound.
    expect(screen.getByText('条目过多，仅显示部分内容')).toBeTruthy()

    fireEvent.click(screen.getByText('src'))
    expect(screen.queryByText('index.ts')).toBeNull()
    expect(b.store.getSnapshot().expansion).toEqual({})

    // Re-expand rides the cache: no second request for the same level.
    fireEvent.click(screen.getByText('src'))
    expect(await screen.findByText('index.ts')).toBeTruthy()
    expect(b.listDirectory).toHaveBeenCalledTimes(2)
  })

  it('shows a listing failure inline and retries it manually', async () => {
    const listDirectory = vi.fn()
      .mockRejectedValueOnce(new Error('directory-unreadable: /repo'))
      .mockResolvedValue(listing('/repo', [file('/repo/a.ts')]))
    mountPanel({ listDirectory })
    expect(await screen.findByText('directory-unreadable: /repo')).toBeTruthy()
    // The failure suppresses auto-refetch: exactly one attempt so far.
    expect(listDirectory).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByText('a.ts')).toBeTruthy()
    expect(listDirectory).toHaveBeenCalledTimes(2)
  })

  it('surfaces a non-Error rejection reason as its string form', async () => {
    mountPanel({ listDirectory: vi.fn(async () => { throw 'plain wire failure' }) })
    expect(await screen.findByText('plain wire failure')).toBeTruthy()
  })

  it('collapse aborts the level\'s in-flight request and drops its late answer', async () => {
    const pending = deferred<DirectoryListing>()
    const listDirectory = vi.fn((path: string): Promise<DirectoryListing> =>
      path === '/repo/src'
        ? pending.promise
        : Promise.resolve(listing('/repo', [dir('/repo/src')])))
    const b = mountPanel({ listDirectory })
    fireEvent.click(await screen.findByText('src'))
    expect(b.store.getSnapshot().loadingPaths).toEqual(['/repo/src'])

    fireEvent.click(screen.getByText('src'))
    expect(b.store.getSnapshot().loadingPaths).toEqual([])
    await act(async () => { pending.resolve(listing('/repo/src', [file('/repo/src/late.ts')])) })
    expect(b.store.getSnapshot().childrenByPath['/repo/src']).toBeUndefined()
  })

  it('filters hidden entries until the header toggle shows them', async () => {
    mountPanel({
      listDirectory: listingStub({ '/repo': listing('/repo', [file('/repo/.env', true), file('/repo/a.ts')]) }),
    })
    expect(await screen.findByText('a.ts')).toBeTruthy()
    const toggle = screen.getByRole('button', { name: '显示隐藏文件' })
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(toggle)
    expect(await screen.findByText('.env')).toBeTruthy()
    expect(screen.getByRole('button', { name: '不显示隐藏文件' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('opens files with the Host default application', async () => {
    const b = mountPanel({
      listDirectory: listingStub({ '/repo': listing('/repo', [file('/repo/a.ts')]) }),
    })
    fireEvent.click(await screen.findByText('a.ts'))
    expect(b.openPath).toHaveBeenCalledWith('/repo/a.ts')
  })

  it('leaves the tree unchanged when opening a file fails', async () => {
    const openPath = vi.fn(async () => { throw new Error('no default handler') })
    mountPanel({
      listDirectory: listingStub({ '/repo': listing('/repo', [file('/repo/a.ts')]) }),
      openPath,
    })
    fireEvent.click(await screen.findByText('a.ts'))
    await waitFor(() => { expect(openPath).toHaveBeenCalledWith('/repo/a.ts') })
    await act(async () => {})
    expect(screen.getByText('a.ts')).toBeTruthy()
  })

  it('shows the empty-directory affordance for a level without visible entries', async () => {
    mountPanel({ listDirectory: listingStub({ '/repo': listing('/repo', []) }) })
    expect(await screen.findByText('此文件夹为空')).toBeTruthy()
  })
})

describe('ExplorerPanel refresh and request abandonment', () => {
  it('refresh clears the listing cache and refetches every still-expanded level', async () => {
    const b = mountPanel({
      listDirectory: listingStub({
        '/repo': listing('/repo', [dir('/repo/src')]),
        '/repo/src': listing('/repo/src', [file('/repo/src/index.ts')]),
      }),
    })
    fireEvent.click(await screen.findByText('src'))
    expect(await screen.findByText('index.ts')).toBeTruthy()
    expect(b.listDirectory).toHaveBeenCalledTimes(2)

    fireEvent.click(screen.getByRole('button', { name: '刷新' }))
    // Expansion survives; both levels refetch.
    await waitFor(() => { expect(b.listDirectory).toHaveBeenCalledTimes(4) })
    expect(await screen.findByText('index.ts')).toBeTruthy()
    expect(b.store.getSnapshot().expansion).toEqual({ '/repo/src': true })
  })

  it('refresh aborts in-flight requests and supersedes them with fresh ones', async () => {
    const first = deferred<DirectoryListing>()
    const listDirectory = vi.fn()
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValue(listing('/repo', [file('/repo/a.ts')]))
    const b = mountPanel({ listDirectory })
    expect(await screen.findByText('正在加载…')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '刷新' }))
    await waitFor(() => { expect(listDirectory).toHaveBeenCalledTimes(2) })
    // The superseded request's late answer is dropped.
    first.resolve(listing('/repo', [file('/repo/stale.ts')]))
    expect(await screen.findByText('a.ts')).toBeTruthy()
    expect(screen.queryByText('stale.ts')).toBeNull()
    expect(b.store.getSnapshot().loadingPaths).toEqual([])
  })

  it('unmount aborts an in-flight request and drops its late resolution', async () => {
    const pending = deferred<DirectoryListing>()
    const b = mountPanel({ listDirectory: vi.fn(() => pending.promise) })
    expect(await screen.findByText('正在加载…')).toBeTruthy()

    b.view.unmount()
    expect(b.store.getSnapshot().loadingPaths).toEqual([])
    await act(async () => { pending.resolve(listing('/repo', [file('/repo/a.ts')])) })
    expect(b.store.getSnapshot().childrenByPath).toEqual({})
  })

  it('unmount aborts an in-flight request and drops its late rejection', async () => {
    const pending = deferred<DirectoryListing>()
    const b = mountPanel({ listDirectory: vi.fn(() => pending.promise) })
    expect(await screen.findByText('正在加载…')).toBeTruthy()

    b.view.unmount()
    await act(async () => { pending.reject(new Error('directory-unreadable: /repo')) })
    expect(b.store.getSnapshot().errorByPath).toEqual({})
    expect(b.store.getSnapshot().loadingPaths).toEqual([])
  })
})
