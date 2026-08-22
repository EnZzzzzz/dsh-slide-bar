// dsh-slide-bar — runtime plugin Client half.
// Reshadows the layout-owned `sidebar` slot with a VSCode-style shell: a
// vertical activity strip plus a switchable panel area. Two panels are
// registered: a lightweight "会话" (sessions/workspaces) default and the
// "资源管理器" file tree. The file tree lists one directory level per
// `host.call('list-directory', ...)` round-trip and opens files through the
// existing `ctx.workspaces.openPath` service.
//
// This file is the exact `code.client` body handed to cordis_define. Plain JS
// only: no imports, no TypeScript, no JSX (use React.createElement). `ctx` /
// `React` / `host` / `styles` / `console` are harness Builtins.

return {
  apply(ctx) {
    const slots = ctx.get('slots')
    if (slots === undefined) return

    const SIDEBAR_KEY = 'dsh.sidebar.view.v1'
    const EXPLORER_KEY = 'dsh.explorer.view.v1'
    const KNOWN_PANELS = ['sessions', 'explorer']

    // ---- persistence (browser localStorage, guarded) ----
    function readJSON(key) {
      try {
        const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null
        return raw ? JSON.parse(raw) : null
      } catch (e) {
        return null
      }
    }
    function writeJSON(key, value) {
      try {
        if (typeof localStorage !== 'undefined') localStorage.setItem(key, JSON.stringify(value))
      } catch (e) {
        /* persistence is best-effort */
      }
    }

    // AbortController is a browser global; guard it so a missing one cannot crash the tree.
    function newController() {
      if (typeof AbortController !== 'undefined') return new AbortController()
      const signal = { aborted: false }
      return { signal, abort: () => { signal.aborted = true } }
    }

    const errorText = (err) => (err && err.message ? String(err.message) : String(err))

    // ---- inline SVG icons (no ui-primitives import in a runtime plugin) ----
    function SvgIcon(props) {
      return React.createElement('svg', {
        width: props.size || 16,
        height: props.size || 16,
        viewBox: '0 0 16 16',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.3,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        className: props.className,
        'aria-hidden': true,
      }, React.createElement('path', { d: props.d }))
    }
    const ICONS = {
      chevronRight: 'M6 3.5 L10 8 L6 12.5',
      chevronDown: 'M3.5 6 L8 10 L12.5 6',
      folder: 'M2 4.5 A1.5 1.5 0 0 1 3.5 3 H5.8 L7.3 4.5 H12.5 A1.5 1.5 0 0 1 14 6 V11.5 A1.5 1.5 0 0 1 12.5 13 H3.5 A1.5 1.5 0 0 1 2 11.5 Z',
      file: 'M4 2 H9 L12 5 V12.5 A1.5 1.5 0 0 1 10.5 14 H4 A1.5 1.5 0 0 1 2.5 12.5 V3.5 A1.5 1.5 0 0 1 4 2 Z M9 2 V5 H12',
      refresh: 'M13.5 8 A5.5 5.5 0 1 1 11 4.3 M13.5 3 V5.5 H11',
      eye: 'M2 8 C4 4.5 12 4.5 14 8 C12 11.5 4 11.5 2 8 Z M6.5 8 A1.5 1.5 0 1 0 9.5 8 A1.5 1.5 0 0 0 6.5 8 Z',
      panelLeft: 'M6 2.5 H4.5 A1.5 1.5 0 0 0 3 4 V12 A1.5 1.5 0 0 0 4.5 13.5 H6 Z M6 2.5 V13.5 M13.5 2.5 H11.5 V13.5 H13.5 Z',
      chat: 'M2.5 4 A1.5 1.5 0 0 1 4 2.5 H12 A1.5 1.5 0 0 1 13.5 4 V9 A1.5 1.5 0 0 1 12 10.5 H7 L4 13.5 V10.5 H4 A1.5 1.5 0 0 1 2.5 9 Z',
    }

    // ---- styles (theme tokens only) ----
    const CSS = `
.dshsb-root{display:flex;flex-direction:row;height:100%;width:100%;box-sizing:border-box;background:var(--dsw-specific-sidebar-fill);color:var(--dsw-alias-label-secondary);overflow:hidden}
.dshsb-root-rail{justify-content:center}
.dshsb-strip{flex:none;width:44px;height:100%;display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px 0;box-sizing:border-box;border-right:1px solid var(--dsw-alias-border-l1)}
.dshsb-root-rail .dshsb-strip{width:100%;border-right:none;padding:8px 0}
.dshsb-divider{flex:none;width:22px;height:1px;background:var(--dsw-alias-border-l1);margin:4px 0}
.dshsb-icon{flex:none;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border:none;border-radius:50%;padding:0;background:transparent;cursor:pointer;color:var(--dsw-alias-label-secondary)}
.dshsb-icon:hover{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary)}
.dshsb-root-rail .dshsb-icon{width:36px;height:36px}
.dshsb-icon-active,.dshsb-icon-active:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.dshsb-panel{flex:1;min-width:0;height:100%;display:flex;flex-direction:column;box-sizing:border-box}
.dshsb-panelroot{flex:1;min-height:0;display:flex;flex-direction:column;box-sizing:border-box;padding:2px 4px 6px 0}
.dshsb-header{flex:none;display:flex;align-items:center;justify-content:space-between;gap:4px;height:32px;padding-left:8px;box-sizing:border-box;color:var(--dsw-alias-label-secondary)}
.dshsb-title{overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:13px;font-weight:600}
.dshsb-headeractions{flex:none;display:flex;align-items:center;gap:2px}
.dshsb-headbtn{flex:none;display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border:none;border-radius:50%;padding:0;background:transparent;cursor:pointer;color:var(--dsw-alias-label-secondary)}
.dshsb-headbtn:hover{background:var(--dsw-alias-bg-layer-1)}
.dshsb-headbtn-active,.dshsb-headbtn-active:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.dshsb-tree{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden}
.dshsb-row{display:flex;align-items:center;gap:4px;width:100%;height:26px;border:none;border-radius:8px;padding:0 8px 0 0;box-sizing:border-box;background:transparent;cursor:pointer;color:var(--dsw-alias-label-secondary);font-size:13px;text-align:left}
.dshsb-row:hover{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary)}
.dshsb-chev{flex:none;color:var(--dsw-alias-label-secondary)}
.dshsb-rowicon{flex:none;color:var(--dsw-alias-label-secondary)}
.dshsb-filespacer{flex:none;width:14px}
.dshsb-name{flex:1;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.dshsb-status{display:flex;align-items:center;gap:8px;min-height:26px;padding:4px 8px 4px 0;box-sizing:border-box;color:var(--dsw-alias-label-secondary);font-size:12px}
.dshsb-error{flex:1;min-width:0;color:var(--dsw-alias-state-error-primary);overflow-wrap:break-word}
.dshsb-retry{flex:none;border:none;border-radius:6px;padding:2px 8px;background:transparent;cursor:pointer;color:var(--dsw-alias-label-secondary);font-size:12px}
.dshsb-retry:hover{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary)}
.dshsb-empty{padding:16px 12px;color:var(--dsw-alias-label-secondary);font-size:13px}
.dshsb-emptyhint{margin-top:4px;font-size:12px}
.dshsb-section{padding:12px 12px 4px;font-size:11px;font-weight:600;letter-spacing:0.03em;color:var(--dsw-alias-label-secondary)}
.dshsb-sessrow{display:flex;flex-direction:column;gap:1px;width:100%;padding:6px 12px;border:none;background:transparent;cursor:pointer;text-align:left;color:var(--dsw-alias-label-secondary);border-radius:8px;box-sizing:border-box}
.dshsb-sessrow:hover{background:var(--dsw-alias-bg-layer-1)}
.dshsb-sessrow-active,.dshsb-sessrow-active:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.dshsb-sessname{font-size:13px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.dshsb-sessmeta{font-size:11px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;opacity:0.75}
`
    const disposeCss = styles.insert(CSS)

    // ---- data verbs ----
    // Listing returns { path, entries, truncated }; entries already carry
    // { name, path, kind: 'file'|'directory', hidden }.
    function listDirectory(path, signal) {
      return host.call('list-directory', { path }).then((res) => {
        if (signal && signal.aborted) throw new Error('已取消')
        if (!res || res.ok !== true) {
          throw new Error(res && res.error ? res.error : '目录读取失败')
        }
        return { path: res.path, entries: res.entries || [], truncated: !!res.truncated }
      })
    }
    function openPath(path) {
      const w = ctx.get('workspaces')
      if (w && typeof w.openPath === 'function') return w.openPath(path)
      return Promise.reject(new Error('工作区服务不可用'))
    }

    function deriveRootPath(sessions, workspaces) {
      const s = sessions || {}
      const currentId = s.current
      const byId = s.byId || {}
      if (currentId !== undefined && byId[currentId] && typeof byId[currentId].cwd === 'string') {
        return byId[currentId].cwd
      }
      const ws = workspaces || {}
      const items = ws.items || []
      const recent = ws.recentWorkspaceId
      for (const item of items) {
        if (item.workspaceId === recent && typeof item.path === 'string') return item.path
      }
      return undefined
    }

    // ---- sidebar shell (reshadows the layout-owned `sidebar` slot) ----
    function SidebarShell(props) {
      const collapsed = !!props.collapsed
      const [activePanelId, setActivePanelId] = React.useState(() => {
        const saved = readJSON(SIDEBAR_KEY)
        const id = saved && typeof saved.activePanelId === 'string' ? saved.activePanelId : 'sessions'
        return KNOWN_PANELS.indexOf(id) !== -1 ? id : 'sessions'
      })
      const selectPanel = React.useCallback((id) => {
        setActivePanelId(id)
        writeJSON(SIDEBAR_KEY, { activePanelId: id })
        if (collapsed && typeof props.toggleSidebar === 'function') props.toggleSidebar()
      }, [collapsed, props.toggleSidebar])
      const wide = !collapsed

      const strip = React.createElement('div', { className: 'dshsb-strip' },
        React.createElement('button', {
          type: 'button',
          className: 'dshsb-icon',
          title: collapsed ? '展开侧边栏' : '折叠侧边栏',
          'aria-label': collapsed ? '展开侧边栏' : '折叠侧边栏',
          onClick: props.toggleSidebar,
        }, React.createElement(SvgIcon, { d: ICONS.panelLeft, size: wide ? 16 : 18 })),
        React.createElement('div', { className: 'dshsb-divider' }),
        props.renderSlot('sidebar.activity', { wide, activePanelId, selectPanel }),
      )
      const panel = wide
        ? React.createElement('div', { className: 'dshsb-panel' }, props.renderSlot('sidebar.panel', { wide, activePanelId }))
        : null
      return React.createElement('div', { className: wide ? 'dshsb-root' : 'dshsb-root dshsb-root-rail' }, strip, panel)
    }

    // ---- activity strip entry ----
    function ActivityIcon(props) {
      const active = props.activePanelId === props.panelId
      const label = props.panelId === 'explorer' ? '资源管理器' : '会话'
      const icon = props.panelId === 'explorer' ? ICONS.folder : ICONS.chat
      return React.createElement('button', {
        type: 'button',
        className: active ? 'dshsb-icon dshsb-icon-active' : 'dshsb-icon',
        title: label,
        'aria-label': label,
        'aria-pressed': active,
        onClick: () => { props.selectPanel(props.panelId) },
      }, React.createElement(SvgIcon, { d: icon, size: props.wide ? 16 : 18 }))
    }

    // ---- default "会话" panel (lightweight session/workspace list) ----
    function SessionsPanel(props) {
      const sessions = props.useSessions((s) => s)
      const wss = props.useWorkspaces((s) => s)
      if (props.activePanelId !== props.panelId) return null

      const s = sessions || {}
      const w = wss || {}
      const byId = s.byId || {}
      const ids = s.ids || []
      const items = w.items || []
      const sessionsSvc = ctx.get('sessions')
      const wsSvc = ctx.get('workspaces')

      const openSession = (id) => { if (sessionsSvc) sessionsSvc.open(id) }
      const connect = (id) => { if (wsSvc) wsSvc.connectWorkspace(id) }

      const rows = []
      if (items.length > 0) {
        rows.push(React.createElement('div', { key: 'ws-sec', className: 'dshsb-section' }, '工作区'))
        for (const item of items) {
          rows.push(React.createElement('button', {
            key: 'ws-' + item.workspaceId,
            type: 'button',
            className: 'dshsb-sessrow',
            onClick: () => { connect(item.workspaceId) },
          },
            React.createElement('span', { className: 'dshsb-sessname' }, item.title || item.path || '未命名工作区'),
            React.createElement('span', { className: 'dshsb-sessmeta' }, item.path || '')))
        }
      }
      if (ids.length > 0) {
        rows.push(React.createElement('div', { key: 's-sec', className: 'dshsb-section' }, '会话'))
        for (const id of ids) {
          const sess = byId[id]
          if (!sess) continue
          const active = s.current === id
          rows.push(React.createElement('button', {
            key: 's-' + id,
            type: 'button',
            className: active ? 'dshsb-sessrow dshsb-sessrow-active' : 'dshsb-sessrow',
            onClick: () => { openSession(id) },
          },
            React.createElement('span', { className: 'dshsb-sessname' }, sess.title || sess.cwd || ('会话 ' + String(id).slice(0, 8))),
            React.createElement('span', { className: 'dshsb-sessmeta' }, sess.cwd || '')))
        }
      }
      if (rows.length === 0) {
        rows.push(React.createElement('div', { key: 'empty', className: 'dshsb-empty' }, '还没有会话或工作区。'))
      }

      return React.createElement('div', { className: 'dshsb-panelroot' },
        React.createElement('div', { className: 'dshsb-header' }, React.createElement('span', { className: 'dshsb-title' }, '会话')),
        React.createElement('div', { className: 'dshsb-tree' }, rows))
    }

    // ---- explorer viewing store (reducer + localStorage persistence) ----
    function viewReducer(state, action) {
      switch (action.type) {
        case 'setExpanded': {
          const expansion = Object.assign({}, state.expansion)
          if (action.expanded) expansion[action.path] = true
          else delete expansion[action.path]
          return Object.assign({}, state, { expansion })
        }
        case 'setLoading': {
          const set = new Set(state.loadingPaths)
          if (action.loading) set.add(action.path)
          else set.delete(action.path)
          return Object.assign({}, state, { loadingPaths: Array.from(set) })
        }
        case 'setChildren': {
          const childrenByPath = Object.assign({}, state.childrenByPath)
          childrenByPath[action.path] = action.entries
          const truncatedByPath = Object.assign({}, state.truncatedByPath)
          if (action.truncated) truncatedByPath[action.path] = true
          else delete truncatedByPath[action.path]
          const errorByPath = Object.assign({}, state.errorByPath)
          delete errorByPath[action.path]
          return Object.assign({}, state, {
            childrenByPath,
            truncatedByPath,
            errorByPath,
            loadingPaths: state.loadingPaths.filter((p) => p !== action.path),
          })
        }
        case 'setError': {
          const errorByPath = Object.assign({}, state.errorByPath)
          errorByPath[action.path] = action.message
          return Object.assign({}, state, { errorByPath, loadingPaths: state.loadingPaths.filter((p) => p !== action.path) })
        }
        case 'toggleHidden':
          return Object.assign({}, state, { showHidden: !state.showHidden })
        case 'invalidate':
          return Object.assign({}, state, { childrenByPath: {}, loadingPaths: [], errorByPath: {}, truncatedByPath: {} })
        default:
          return state
      }
    }
    function initialView() {
      const saved = readJSON(EXPLORER_KEY) || {}
      const expansion = saved.expansion && typeof saved.expansion === 'object' && !Array.isArray(saved.expansion) ? saved.expansion : {}
      return {
        expansion,
        childrenByPath: {},
        loadingPaths: [],
        errorByPath: {},
        truncatedByPath: {},
        showHidden: !!saved.showHidden,
      }
    }

    // ---- one directory level of the tree ----
    function DirectoryChildren(props) {
      const path = props.path
      const depth = props.depth
      const view = props.view
      const load = props.load
      const abort = props.abort
      const toggle = props.toggle
      const openFile = props.openFile

      const children = view.childrenByPath[path]
      const error = view.errorByPath[path]
      const loading = view.loadingPaths.indexOf(path) !== -1

      React.useEffect(() => {
        if (children !== undefined || error !== undefined) return
        load(path)
      }, [path, children, error, loading, load])

      React.useEffect(() => () => { abort(path) }, [path, abort])

      const indent = { paddingLeft: 8 + depth * 12 }
      if (children === undefined) {
        if (error !== undefined) {
          return React.createElement('div', { className: 'dshsb-status', style: indent },
            React.createElement('span', { className: 'dshsb-error', role: 'alert' }, error),
            React.createElement('button', { type: 'button', className: 'dshsb-retry', onClick: () => { load(path) } }, '重试'))
        }
        if (loading) return React.createElement('div', { className: 'dshsb-status', style: indent }, '正在加载…')
        return null
      }
      const visible = view.showHidden ? children : children.filter((e) => !e.hidden)
      if (visible.length === 0) {
        return React.createElement('div', { className: 'dshsb-status', style: indent }, '此文件夹为空')
      }
      const rows = []
      visible.forEach((entry) => {
        if (entry.kind === 'directory') {
          const expanded = view.expansion[entry.path] === true
          rows.push(React.createElement('div', { key: entry.path },
            React.createElement('button', {
              type: 'button',
              className: 'dshsb-row',
              style: indent,
              'aria-expanded': expanded,
              onClick: () => { toggle(entry.path, !expanded) },
            },
              React.createElement(SvgIcon, { className: 'dshsb-chev', d: expanded ? ICONS.chevronDown : ICONS.chevronRight, size: 14 }),
              React.createElement(SvgIcon, { className: 'dshsb-rowicon', d: ICONS.folder, size: 16 }),
              React.createElement('span', { className: 'dshsb-name' }, entry.name)),
            expanded
              ? React.createElement(DirectoryChildren, { path: entry.path, depth: depth + 1, view, load, abort, toggle, openFile })
              : null))
        } else {
          rows.push(React.createElement('button', {
            key: entry.path,
            type: 'button',
            className: 'dshsb-row',
            style: indent,
            onClick: () => { openFile(entry.path) },
          },
            React.createElement('span', { className: 'dshsb-filespacer' }),
            React.createElement(SvgIcon, { className: 'dshsb-rowicon', d: ICONS.file, size: 16 }),
            React.createElement('span', { className: 'dshsb-name' }, entry.name)))
        }
      })
      if (view.truncatedByPath[path] === true) {
        rows.push(React.createElement('div', { key: '__trunc', className: 'dshsb-status', style: indent }, '条目过多，仅显示部分内容'))
      }
      return React.createElement(React.Fragment, null, rows)
    }

    // ---- explorer panel ----
    function ExplorerPanel(props) {
      const sessions = props.useSessions((s) => s)
      const wss = props.useWorkspaces((s) => s)
      const [view, dispatch] = React.useReducer(viewReducer, undefined, initialView)
      const controllersRef = React.useRef()
      if (controllersRef.current === undefined) controllersRef.current = new Map()
      const controllers = controllersRef.current

      React.useEffect(() => {
        writeJSON(EXPLORER_KEY, { expansion: view.expansion, showHidden: view.showHidden })
      }, [view.expansion, view.showHidden])

      const rootPath = React.useMemo(() => deriveRootPath(sessions, wss), [sessions, wss])

      const load = React.useCallback((path) => {
        if (controllers.has(path)) return
        const controller = newController()
        controllers.set(path, controller)
        dispatch({ type: 'setLoading', path, loading: true })
        listDirectory(path, controller.signal).then((listing) => {
          if (controller.signal.aborted) return
          dispatch({ type: 'setChildren', path, entries: listing.entries, truncated: listing.truncated })
        }, (reason) => {
          if (controller.signal.aborted) return
          dispatch({ type: 'setError', path, message: errorText(reason) })
        }).then(() => { controllers.delete(path) })
      }, [controllers])

      const abort = React.useCallback((path) => {
        const controller = controllers.get(path)
        if (controller === undefined) return
        controllers.delete(path)
        controller.abort()
        dispatch({ type: 'setLoading', path, loading: false })
      }, [controllers])

      React.useEffect(() => {
        const pending = controllers
        return () => {
          for (const [path, controller] of pending) {
            controller.abort()
            dispatch({ type: 'setLoading', path, loading: false })
          }
          pending.clear()
        }
      }, [controllers])

      const toggle = React.useCallback((path, expanded) => { dispatch({ type: 'setExpanded', path, expanded }) }, [])
      const openFile = React.useCallback((path) => { openPath(path).catch(() => {}) }, [])
      const refresh = React.useCallback(() => {
        for (const controller of controllers.values()) controller.abort()
        controllers.clear()
        dispatch({ type: 'invalidate' })
      }, [controllers])

      if (props.activePanelId !== props.panelId) return null

      const header = React.createElement('div', { className: 'dshsb-header' },
        React.createElement('span', { className: 'dshsb-title' }, '资源管理器'),
        React.createElement('div', { className: 'dshsb-headeractions' },
          React.createElement('button', {
            type: 'button',
            className: view.showHidden ? 'dshsb-headbtn dshsb-headbtn-active' : 'dshsb-headbtn',
            title: view.showHidden ? '不显示隐藏文件' : '显示隐藏文件',
            'aria-label': view.showHidden ? '不显示隐藏文件' : '显示隐藏文件',
            'aria-pressed': view.showHidden,
            onClick: () => { dispatch({ type: 'toggleHidden' }) },
          }, React.createElement(SvgIcon, { d: ICONS.eye, size: 16 })),
          React.createElement('button', {
            type: 'button',
            className: 'dshsb-headbtn',
            title: '刷新',
            'aria-label': '刷新',
            onClick: refresh,
          }, React.createElement(SvgIcon, { d: ICONS.refresh, size: 16 })),
        ),
      )

      if (wss && wss.baselinesReady === false) {
        return React.createElement('div', { className: 'dshsb-panelroot' }, header,
          React.createElement('div', { className: 'dshsb-status' }, '正在加载…'))
      }
      if (rootPath === undefined) {
        return React.createElement('div', { className: 'dshsb-panelroot' }, header,
          React.createElement('div', { className: 'dshsb-empty' },
            React.createElement('div', null, '没有可用的工作区'),
            React.createElement('div', { className: 'dshsb-emptyhint' }, '打开或新建一个会话后，这里会显示其工作目录。')))
      }
      return React.createElement('div', { className: 'dshsb-panelroot' }, header,
        React.createElement('div', { className: 'dshsb-tree' },
          React.createElement(DirectoryChildren, { path: rootPath, depth: 0, view, load, abort, toggle, openFile })))
    }

    // ---- registrations (one lifecycle effect) ----
    ctx.effect(() => {
      const disposers = [disposeCss]
      disposers.push(slots.register({
        name: 'sidebar',
        priority: -1,
        children: {
          'sidebar.activity': { kind: 'list', scope: 'root' },
          'sidebar.panel': { kind: 'list', scope: 'root' },
        },
        inject: () => ({
          toggleSidebar: () => {
            const l = ctx.get('layout')
            if (l && typeof l.toggleSidebar === 'function') l.toggleSidebar()
          },
        }),
      }, SidebarShell))
      disposers.push(slots.register({ name: 'sidebar.activity', id: 'sessions', order: 1, inject: () => ({ panelId: 'sessions' }) }, ActivityIcon))
      disposers.push(slots.register({ name: 'sidebar.activity', id: 'explorer', order: 2, inject: () => ({ panelId: 'explorer' }) }, ActivityIcon))
      disposers.push(slots.register({ name: 'sidebar.panel', id: 'sessions', order: 1, inject: () => ({ panelId: 'sessions' }) }, SessionsPanel))
      disposers.push(slots.register({ name: 'sidebar.panel', id: 'explorer', order: 2, inject: () => ({ panelId: 'explorer', listDirectory, openPath }) }, ExplorerPanel))
      return () => {
        for (const d of disposers) {
          try { if (typeof d === 'function') d() } catch (e) { /* noop */ }
        }
      }
    })
  },
}
