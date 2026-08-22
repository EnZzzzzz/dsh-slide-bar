/**
 * The explorer panel's viewing store: expansion state, the fetched one-level
 * directory cache, per-path load failure, and the hidden-files toggle,
 * persisted across reloads. Module level exports the factory only (a
 * module-level handle would pin the store identity across plugin reloads);
 * register() receives the handle and the panel derives its PropsStore share
 * from the return type.
 */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-runtime/client'
import type { DirectoryEntry } from '@deepseek-ai/dsh-client-runtime/client'

/** Explorer viewing state persisted across panel remounts and reloads. */
type ExplorerViewState = {
  /** Directory path → expanded; collapsed paths are absent. */
  expansion: Record<string, boolean>
  /** Fetched one-level children per directory path (the listing cache). */
  childrenByPath: Record<string, DirectoryEntry[]>
  /** Paths with an in-flight listing request (display-only; fetch gating is the component's controllers). */
  loadingPaths: string[]
  /** Path → last listing failure message (presence suppresses auto-refetch; retry is manual). */
  errorByPath: Record<string, string>
  /** Directory path → the Host cut its entries at the complete-result bound. */
  truncatedByPath: Record<string, boolean>
  /** Whether entries the Host marks hidden render in the tree. */
  showHidden: boolean
}

/**
 * Annotation twin of the actions literal below (the export needs a declared
 * return type); drift fails assignability at the defineStore call.
 */
type ExplorerViewActions = {
  setExpanded: (draft: ExplorerViewState, path: string, expanded: boolean) => void
  setLoading: (draft: ExplorerViewState, path: string, loading: boolean) => void
  setChildren: (draft: ExplorerViewState, path: string, entries: DirectoryEntry[], truncated: boolean) => void
  setError: (draft: ExplorerViewState, path: string, message: string) => void
  toggleHidden: (draft: ExplorerViewState) => void
  invalidate: (draft: ExplorerViewState) => void
}

/** Drop one path key from a record draft (dynamic `delete` is lint-forbidden). */
const omitKey = <V>(record: Record<string, V>, key: string): Record<string, V> =>
  Object.fromEntries(Object.entries(record).filter(([k]) => k !== key))

/**
 * Create the explorer viewing store handle.
 * @returns the store handle (spec + type + identity + factory in one).
 */
export function createExplorerStore(): EngineStoreHandle<ExplorerViewState, ExplorerViewActions> {
  return defineStore({
    init: (): ExplorerViewState => ({
      expansion: {},
      childrenByPath: {},
      loadingPaths: [],
      errorByPath: {},
      truncatedByPath: {},
      showHidden: false,
    }),
    persist: 'dsh.explorer.view.v1',
    actions: {
      setExpanded: (d, path: string, expanded: boolean) => {
        if (expanded) d.expansion[path] = true
        else d.expansion = omitKey(d.expansion, path)
      },
      setLoading: (d, path: string, loading: boolean) => {
        if (loading) {
          if (!d.loadingPaths.includes(path)) d.loadingPaths.push(path)
        } else {
          d.loadingPaths = d.loadingPaths.filter(p => p !== path)
        }
      },
      setChildren: (d, path: string, entries: DirectoryEntry[], truncated: boolean) => {
        d.childrenByPath[path] = entries
        if (truncated) d.truncatedByPath[path] = true
        else d.truncatedByPath = omitKey(d.truncatedByPath, path)
        d.errorByPath = omitKey(d.errorByPath, path)
        d.loadingPaths = d.loadingPaths.filter(p => p !== path)
      },
      setError: (d, path: string, message: string) => {
        d.errorByPath[path] = message
        d.loadingPaths = d.loadingPaths.filter(p => p !== path)
      },
      toggleHidden: (d) => { d.showHidden = !d.showHidden },
      // Refresh: drop the listing cache and failure markers, keep expansion —
      // every still-expanded directory refetches on its next render.
      invalidate: (d) => {
        d.childrenByPath = {}
        d.loadingPaths = []
        d.errorByPath = {}
        d.truncatedByPath = {}
      },
    },
  })
}
