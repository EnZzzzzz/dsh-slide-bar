/**
 * Explorer slot contract: the registrant-side props composition for the
 * sidebar shell's activity-bar holes. This package fills `sidebar.activity`
 * with one folder icon (its own panel id rides its inject face) and
 * `sidebar.panel` with the file-tree panel, which self-gates on the shell's
 * activePanelId. The panel's data verbs arrive through its inject face; the
 * root directory derives from the framework's global useSessions /
 * useWorkspaces hooks (PropsRuntime's standing seats).
 */
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls ui-sidebar's SlotMap merges (the 'sidebar.activity' and
// 'sidebar.panel' entries) into every program that sees this contract.
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { DirectoryListing } from '@deepseek-ai/dsh-client-runtime/client'
import type { createExplorerStore } from '../stores.ts'
import type { ExplorerKey } from '../locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** File explorer panel copy. */
    explorer: ExplorerKey
  }
}

/**
 * Activity-entry injected share: the panel id this icon selects and
 * highlights against. The shell's owner share carries activePanelId and
 * selectPanel; the entry itself only needs to know who it is.
 */
export type ExplorerActivityInjected = {
  /** This registration's panel id (the `sidebar.panel` entry id). */
  panelId: 'explorer'
}

/**
 * Panel injected share: the Host directory verbs the tree drives. Both are
 * plain callbacks closed over the apply ctx; data reads (current session cwd,
 * recent workspace path) use the framework hooks instead.
 */
export type ExplorerPanelInjected = {
  /** This registration's panel id (self-gating compares it to activePanelId). */
  panelId: 'explorer'
  /**
   * List one directory level, files included.
   * @param path - absolute directory to list.
   * @param signal - aborts the wire request when the caller supersedes it.
   * @returns the level's listing (entries sorted by the Host: directories first).
   */
  listDirectory: (path: string, signal: AbortSignal) => Promise<DirectoryListing>
  /**
   * Open a filesystem path with the Host operating system's default application.
   * @param path - absolute host path.
   */
  openPath: (path: string) => Promise<void>
}

/** Full activity-icon props: shell owner share + own panel id + locale seat. */
export type ExplorerActivityIconProps =
  PropsRuntime<'sidebar.activity'>
  & ExplorerActivityInjected
  & PropsLocale<'explorer'>

/**
 * Full panel props: shell owner share (wide / activePanelId / expandSidebar),
 * the viewing store share, and the directory verbs. `panelId` widens to
 * string so the component stays honest about the self-gate comparison instead
 * of baking in its own registration id.
 */
export type ExplorerPanelProps =
  PropsRuntime<'sidebar.panel'>
  & PropsStore<ReturnType<typeof createExplorerStore>>
  & Omit<ExplorerPanelInjected, 'panelId'>
  & { panelId: string }
  & PropsLocale<'explorer'>
