// @vitest-environment jsdom
/** The sidebar view store: panel selection state and its persistence. */
import { beforeEach, describe, expect, it } from 'vitest'
import { createSidebarViewStore, WORKSPACES_PANEL_ID } from '../src/client/stores.ts'

beforeEach(() => { localStorage.clear() })

describe('createSidebarViewStore', () => {
  it('starts on the built-in workspaces panel', () => {
    const store = createSidebarViewStore().create()
    expect(store.getSnapshot()).toEqual({ activePanelId: WORKSPACES_PANEL_ID })
    expect(WORKSPACES_PANEL_ID).toBe('workspaces')
  })

  it('selects panels through the declared action', () => {
    const store = createSidebarViewStore().create()
    store.actions.selectPanel('explorer')
    expect(store.getSnapshot().activePanelId).toBe('explorer')
  })

  it('persists the selection under dsh.sidebar.view.v1 and rehydrates a fresh instance', () => {
    expect(createSidebarViewStore().spec.persist).toBe('dsh.sidebar.view.v1')
    createSidebarViewStore().create().actions.selectPanel('explorer')
    expect(createSidebarViewStore().create().getSnapshot().activePanelId).toBe('explorer')
  })
})
