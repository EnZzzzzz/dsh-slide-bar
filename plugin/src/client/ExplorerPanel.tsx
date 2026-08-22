/**
 * The explorer's `sidebar.panel` entry: a lazy-loaded file tree rooted at the
 * current session's working directory (falling back to the recent workspace's
 * path). The panel self-gates on the shell's activePanelId, renders a header
 * (title, hidden-files toggle, refresh), and walks one directory level per
 * `listDirectory` call.
 *
 * Loading model: mounting a directory's children view (root mount, expand,
 * refresh with persisted expansion) fetches that level when the store holds
 * neither a cache entry nor an error for it; a failure suppresses auto-retry
 * (the retry affordance is the manual gesture). One in-flight request per
 * path, tracked in a component-local controller map: a superseding request,
 * a collapse unmount, a refresh, or a panel unmount aborts it. The Host
 * delivers entries already sorted (directories first, then files, each
 * name-sorted); the client only filters hidden entries.
 */
import { useCallback, useEffect, useMemo, useRef } from 'react'
import clsx from 'clsx'
import {
  IconChevronDownOutline14, IconChevronRightOutline14, IconEllipsisOutline16,
  IconFolderClose16, IconRefreshOutline16, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  DirectoryEntry, SessionListState, WorkspaceListState,
} from '@deepseek-ai/dsh-client-runtime/client'
import type { ExplorerPanelProps } from './contract/slots.ts'
import css from './ExplorerPanel.module.css'

/** Per-depth row indent (px); depth 0 rows sit at the base inset. */
const INDENT_BASE_PX = 8
const INDENT_STEP_PX = 12

/** Snapshot of the viewing-store fields the tree reads (PropsStore share state). */
type ExplorerView = {
  expansion: Record<string, boolean>
  childrenByPath: Record<string, DirectoryEntry[]>
  loadingPaths: string[]
  errorByPath: Record<string, string>
  truncatedByPath: Record<string, boolean>
  showHidden: boolean
}

/**
 * Derive the tree root from framework-hook data: the current session's
 * recorded cwd, else the recent workspace's path, else undefined (empty state).
 * @param sessions - the useSessions snapshot.
 * @param workspaces - the useWorkspaces snapshot.
 * @returns the absolute root path, or undefined when neither source has one.
 */
export function deriveRootPath(
  sessions: SessionListState,
  workspaces: WorkspaceListState,
): string | undefined {
  const currentId = sessions.current
  const cwd = currentId === undefined ? undefined : sessions.byId[currentId]?.cwd
  if (cwd !== undefined) return cwd
  return workspaces.items.find(w => w.workspaceId === workspaces.recentWorkspaceId)?.path
}

/** The tree's imperative verbs, threaded down as plain props. */
interface TreeDriver {
  /** Fetch one directory level (no-op while that level's request is in flight). */
  load: (path: string) => void
  /** Abort a level's in-flight request and clear its loading marker. */
  abort: (path: string) => void
  /** Flip one directory's expansion. */
  toggle: (path: string, expanded: boolean) => void
  /** Open a file with the Host's default application. */
  openFile: (path: string) => void
}

interface DirectoryChildrenProps extends TreeDriver {
  /** The directory whose one-level children this view renders. */
  path: string
  /** Nesting depth (indent only). */
  depth: number
  /** The viewing-store snapshot. */
  view: ExplorerView
  /** The locale seat. */
  t: ExplorerPanelProps['t']
}

/**
 * Render one directory level: fetch-on-mount when uncached, then the level's
 * rows (recursing into expanded subdirectories), plus inline loading, error,
 * empty, and truncated affordances.
 * @param props - level identity, store snapshot, and the tree driver.
 * @returns the level's rows or its status affordance.
 */
function DirectoryChildren({ path, depth, view, t, load, abort, toggle, openFile }: DirectoryChildrenProps) {
  const children = view.childrenByPath[path]
  const error = view.errorByPath[path]
  const loading = view.loadingPaths.includes(path)

  // Fetch-on-need: this view mounts when its row expands (or on root mount /
  // refresh with persisted expansion) and loads only when the store holds
  // neither data nor a failure for the path. A stored error suppresses
  // auto-retry; the retry button below is the manual re-entry. `loading` is a
  // trigger-only dependency: the in-flight guard lives in load()'s controller
  // map, so a refresh that clears the markers mid-flight refires this effect
  // into a fresh request.
  useEffect(() => {
    if (children !== undefined || error !== undefined) return
    load(path)
  }, [path, children, error, loading, load])

  // Unmount (collapse, root switch, panel switch) abandons the level's
  // in-flight request.
  useEffect(() => () => { abort(path) }, [path, abort])

  const indent = { paddingInlineStart: INDENT_BASE_PX + depth * INDENT_STEP_PX }
  if (children === undefined) {
    if (error !== undefined) {
      return (
        <div className={css.statusRow} style={indent}>
          <span className={css.errorText} role="alert">{error}</span>
          <button type="button" className={css.retryButton} onClick={() => { load(path) }}>
            {t('error.retry')}
          </button>
        </div>
      )
    }
    /* Loading is the only other uncached state: a stored error suppresses the
       effect, and load() runs synchronously on mount otherwise. */
    if (loading) return <div className={css.statusRow} style={indent}>{t('panel.loading')}</div>
    return null
  }
  const visible = view.showHidden ? children : children.filter(entry => !entry.hidden)
  if (visible.length === 0) {
    return <div className={css.statusRow} style={indent}>{t('empty.directory')}</div>
  }
  return (
    <>
      {visible.map(entry => entry.kind === 'directory' ? (
        <div key={entry.path}>
          <button
            type="button"
            className={css.row}
            style={indent}
            aria-expanded={view.expansion[entry.path] === true}
            onClick={() => { toggle(entry.path, view.expansion[entry.path] !== true) }}
          >
            {view.expansion[entry.path] === true
              ? <IconChevronDownOutline14 className={css.chevron} />
              : <IconChevronRightOutline14 className={css.chevron} />}
            <IconFolderClose16 className={css.rowIcon} />
            <span className={css.name}>{entry.name}</span>
          </button>
          {view.expansion[entry.path] === true && (
            <DirectoryChildren
              path={entry.path} depth={depth + 1} view={view} t={t}
              load={load} abort={abort} toggle={toggle} openFile={openFile}
            />
          )}
        </div>
      ) : (
        <button
          key={entry.path}
          type="button"
          className={css.row}
          style={indent}
          onClick={() => { openFile(entry.path) }}
        >
          {/* No file glyph in the icon set: a fixed spacer keeps file names
              aligned with directory names. */}
          <span className={css.fileSpacer} />
          <span className={css.name}>{entry.name}</span>
        </button>
      ))}
      {view.truncatedByPath[path] === true && (
        <div className={css.statusRow} style={indent}>{t('panel.truncated')}</div>
      )}
    </>
  )
}

/**
 * Render the explorer panel (self-gated on the shell's activePanelId).
 * @param props - composed slot props (owner + store + injected verbs + locale).
 * @returns the panel element tree, or null while another panel is active.
 */
export function ExplorerPanel({
  activePanelId,
  panelId,
  useSessions,
  useWorkspaces,
  useStore,
  actions,
  listDirectory,
  openPath,
  t,
}: ExplorerPanelProps) {
  const sessions = useSessions(s => s)
  const workspaces = useWorkspaces(s => s)
  const view = useStore(s => s)
  const rootPath = useMemo(() => deriveRootPath(sessions, workspaces), [sessions, workspaces])

  // One in-flight request per path. Component-local because in-flight identity
  // is interaction state, not view state; the store's loadingPaths is the
  // display mirror.
  const controllers = useRef(new Map<string, AbortController>())

  const load = useCallback((path: string): void => {
    if (controllers.current.has(path)) return
    const controller = new AbortController()
    controllers.current.set(path, controller)
    actions.setLoading(path, true)
    void listDirectory(path, controller.signal).then((listing) => {
      if (controller.signal.aborted) return
      actions.setChildren(path, listing.entries, listing.truncated)
    }, (reason: unknown) => {
      if (controller.signal.aborted) return
      actions.setError(path, reason instanceof Error ? reason.message : String(reason))
    }).finally(() => {
      controllers.current.delete(path)
    })
  }, [listDirectory, actions])

  const abort = useCallback((path: string): void => {
    const controller = controllers.current.get(path)
    if (controller === undefined) return
    controllers.current.delete(path)
    controller.abort()
    actions.setLoading(path, false)
  }, [actions])

  // Abandon every in-flight request when the panel unmounts (panel switch or
  // plugin teardown); each level's own cleanup covers collapse.
  useEffect(() => {
    const pending = controllers.current
    return () => {
      for (const [path, controller] of pending) {
        controller.abort()
        actions.setLoading(path, false)
      }
      pending.clear()
    }
  }, [actions])

  const toggle = useCallback((path: string, expanded: boolean): void => {
    actions.setExpanded(path, expanded)
  }, [actions])

  const openFile = useCallback((path: string): void => {
    // Open failure (no default handler, remote Host) leaves the tree unchanged.
    void openPath(path).catch(() => {})
  }, [openPath])

  // Refresh keeps expansion and drops the listing cache: every still-mounted
  // level view refetches through its fetch-on-need effect.
  const refresh = useCallback((): void => {
    for (const controller of controllers.current.values()) controller.abort()
    controllers.current.clear()
    actions.invalidate()
  }, [actions])

  // Self-gate: the shell renders the whole `sidebar.panel` list and cannot
  // know entry ids (all hooks above run regardless).
  if (activePanelId !== panelId) return null

  const header = (
    <div className={css.header}>
      <span className={css.title}>{t('panel.title')}</span>
      <div className={css.headerActions}>
        <Tooltip label={view.showHidden ? t('panel.hidden.hide') : t('panel.hidden.show')} delayMs={500}>
          <button
            type="button"
            className={clsx(css.iconButton, view.showHidden && css.activeAction)}
            aria-label={view.showHidden ? t('panel.hidden.hide') : t('panel.hidden.show')}
            aria-pressed={view.showHidden}
            onClick={() => { actions.toggleHidden() }}
          >
            {/* No eye glyph in the icon set; the overflow glyph is the view-options seat. */}
            <IconEllipsisOutline16 size={16} />
          </button>
        </Tooltip>
        <Tooltip label={t('panel.refresh')} delayMs={500}>
          <button
            type="button"
            className={css.iconButton}
            aria-label={t('panel.refresh')}
            onClick={refresh}
          >
            <IconRefreshOutline16 size={16} />
          </button>
        </Tooltip>
      </div>
    </div>
  )

  // The session/workspace baselines decide whether "no root" is final.
  if (!workspaces.baselinesReady) {
    return (
      <div className={css.root}>
        {header}
        <div className={css.statusRow} style={{ paddingInlineStart: INDENT_BASE_PX }}>{t('panel.loading')}</div>
      </div>
    )
  }
  if (rootPath === undefined) {
    return (
      <div className={css.root}>
        {header}
        <div className={css.empty}>
          <div>{t('empty.noWorkspace')}</div>
          <div className={css.emptyHint}>{t('empty.hint')}</div>
        </div>
      </div>
    )
  }
  return (
    <div className={css.root}>
      {header}
      <div className={css.tree}>
        <DirectoryChildren
          path={rootPath} depth={0} view={view} t={t}
          load={load} abort={abort} toggle={toggle} openFile={openFile}
        />
      </div>
    </div>
  )
}
