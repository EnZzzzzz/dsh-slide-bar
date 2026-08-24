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
import type { createExplorerStore } from '../stores.ts'
import type { ExplorerKey } from '../locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** File explorer panel copy. */
    explorer: ExplorerKey
  }
}

/**
 * One file-tree row: an absolute path plus its kind. The file tree is driven
 * by the host fileReferences Remote (relative path + kind, files included),
 * because ctx.workspaces.listDirectory returns directories only and no kind.
 */
export type ExplorerEntry = {
  /** Base name shown in a browser row. */
  name: string
  /** Absolute host path. */
  path: string
  /** Directory or file; drives the tree's expand/open split. */
  kind: 'file' | 'directory'
  /** Hidden by the host platform's convention (dot-prefixed on POSIX). */
  hidden: boolean
}

/** One listed level: the absolute directory listed plus its entries. */
export type ExplorerListing = {
  /** Absolute path of the listed directory. */
  path: string
  /** The level's child rows (directories and files). */
  entries: ExplorerEntry[]
  /** True when the host cut the level at its result bound. */
  truncated: boolean
}

/** One fileReference candidate row (relative path + kind). */
export type FileReferenceCandidate = {
  /** Path relative to the session cwd ('' = root; sub paths have no leading slash). */
  path: string
  kind: 'file' | 'directory'
}

/**
 * Minimal typed face of the host fileReferences Remote this plugin drives.
 * The full face is merged into ctx.remote by the dsh-file-reference package;
 * the plugin only needs list() and declares its own narrow contract instead
 * of depending on that package's generated types.
 */
export type FileReferencesRemote = {
  list: (
    sessionId: string,
    query: string,
    signal?: AbortSignal,
  ) => Promise<{ ok: true; value: FileReferenceCandidate[] } | { ok: false; error: { message?: string } }>
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
   * List one directory level (absolute path), files included.
   * @param path - absolute directory to list.
   * @param signal - aborts the wire request when the caller supersedes it.
   * @returns the level's listing with kind-carrying entries.
   */
  listDirectory: (path: string, signal: AbortSignal) => Promise<ExplorerListing>
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
