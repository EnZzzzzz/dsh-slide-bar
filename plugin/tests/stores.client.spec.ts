// @vitest-environment jsdom
/** The explorer view store: expansion, listing cache, load markers, and persistence. */
import { beforeEach, describe, expect, it } from 'vitest'
import type { DirectoryEntry } from '@deepseek-ai/dsh-client-runtime/client'
import { createExplorerStore } from '../src/client/stores.ts'

beforeEach(() => { localStorage.clear() })

const entry = (name: string, kind: DirectoryEntry['kind'] = 'directory'): DirectoryEntry => ({
  name, path: `/root/${name}`, hidden: false, kind,
})

describe('createExplorerStore', () => {
  it('starts empty with hidden files off', () => {
    expect(createExplorerStore().create().getSnapshot()).toEqual({
      expansion: {},
      childrenByPath: {},
      loadingPaths: [],
      errorByPath: {},
      truncatedByPath: {},
      showHidden: false,
    })
  })

  it('tracks expansion by presence (collapse deletes the key)', () => {
    const store = createExplorerStore().create()
    store.actions.setExpanded('/root/src', true)
    expect(store.getSnapshot().expansion).toEqual({ '/root/src': true })
    store.actions.setExpanded('/root/src', false)
    expect(store.getSnapshot().expansion).toEqual({})
  })

  it('tracks loading paths uniquely and removes them', () => {
    const store = createExplorerStore().create()
    store.actions.setLoading('/root', true)
    store.actions.setLoading('/root', true)
    store.actions.setLoading('/root/src', true)
    expect(store.getSnapshot().loadingPaths).toEqual(['/root', '/root/src'])
    store.actions.setLoading('/root', false)
    expect(store.getSnapshot().loadingPaths).toEqual(['/root/src'])
  })

  it('writes children with the truncated marker and clears the path\'s loading and error', () => {
    const store = createExplorerStore().create()
    store.actions.setLoading('/root', true)
    store.actions.setError('/root', 'permission denied')
    store.actions.setChildren('/root', [entry('src')], true)
    expect(store.getSnapshot().childrenByPath['/root']).toEqual([entry('src')])
    expect(store.getSnapshot().truncatedByPath).toEqual({ '/root': true })
    expect(store.getSnapshot().errorByPath).toEqual({})
    expect(store.getSnapshot().loadingPaths).toEqual([])
    // A later untruncated listing drops the marker.
    store.actions.setChildren('/root', [entry('src')], false)
    expect(store.getSnapshot().truncatedByPath).toEqual({})
  })

  it('records an error and clears the path\'s loading marker', () => {
    const store = createExplorerStore().create()
    store.actions.setLoading('/root', true)
    store.actions.setError('/root', 'permission denied')
    expect(store.getSnapshot().errorByPath).toEqual({ '/root': 'permission denied' })
    expect(store.getSnapshot().loadingPaths).toEqual([])
  })

  it('toggles hidden-file visibility', () => {
    const store = createExplorerStore().create()
    store.actions.toggleHidden()
    expect(store.getSnapshot().showHidden).toBe(true)
    store.actions.toggleHidden()
    expect(store.getSnapshot().showHidden).toBe(false)
  })

  it('invalidate drops the listing cache and load markers but keeps expansion', () => {
    const store = createExplorerStore().create()
    store.actions.setExpanded('/root/src', true)
    store.actions.setChildren('/root', [entry('src')], true)
    store.actions.setLoading('/root/lib', true)
    store.actions.setError('/root/tmp', 'gone')
    store.actions.invalidate()
    expect(store.getSnapshot()).toEqual({
      expansion: { '/root/src': true },
      childrenByPath: {},
      loadingPaths: [],
      errorByPath: {},
      truncatedByPath: {},
      showHidden: false,
    })
  })

  it('persists under dsh.explorer.view.v1 and rehydrates a fresh instance', () => {
    expect(createExplorerStore().spec.persist).toBe('dsh.explorer.view.v1')
    const store = createExplorerStore().create()
    store.actions.setExpanded('/root/src', true)
    store.actions.toggleHidden()
    const rehydrated = createExplorerStore().create().getSnapshot()
    expect(rehydrated.expansion).toEqual({ '/root/src': true })
    expect(rehydrated.showHidden).toBe(true)
  })
})
