/**
 * The sidebar shell's panel-selection store: which activity panel the
 * browsing region shows, persisted across reloads. Module level exports the
 * factory only (a module-level handle would pin the store identity across
 * plugin reloads); register() receives the handle and the shell derives its
 * PropsStore share from the return type.
 */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-runtime/client'

/**
 * Panel id of the built-in default panel: the workspace/session browser
 * rendered through the `sidebar.workspaces` slot. The shell's Sessions
 * activity icon is pinned first and always targets this id.
 */
export const WORKSPACES_PANEL_ID = 'workspaces'

/** Sidebar view state: the panel the browsing region currently shows. */
type SidebarViewState = {
  /** Active panel id — the built-in {@link WORKSPACES_PANEL_ID} or a `sidebar.panel` entry id. */
  activePanelId: string
}

/**
 * Annotation twin of the actions literal below (the export needs a declared
 * return type); drift fails assignability at the defineStore call.
 */
type SidebarViewActions = {
  selectPanel: (draft: SidebarViewState, id: string) => void
}

/**
 * Create the sidebar panel-selection store handle.
 * @returns the store handle (spec + type + identity + factory in one).
 */
export function createSidebarViewStore(): EngineStoreHandle<SidebarViewState, SidebarViewActions> {
  return defineStore({
    init: (): SidebarViewState => ({ activePanelId: WORKSPACES_PANEL_ID }),
    persist: 'dsh.sidebar.view.v1',
    actions: {
      selectPanel: (d, id: string) => { d.activePanelId = id },
    },
  })
}
