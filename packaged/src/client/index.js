// dsh-sidebar-live — client half (formal installable package).
//
// Adapted from the runtime plugin (runtime-plugin/client.js): the same
// self-contained sidebar shell (reshadows `sidebar`, declares
// `sidebar.activity` + `sidebar.panel`), sessions workspace tree, and file
// explorer. Differences from the dynamic version:
//   - No dynamic `host.call` / `styles` closures: directory data comes from
//     the host fileReferences Remote (`ctx.remote.fileReferences.list`), which
//     lists one level of the current session's cwd and returns relative
//     paths + kind; CSS is injected through a plain <style> element.
//   - Tree keys are RELATIVE paths ('' = cwd root, 'sub' = a subdirectory);
//     absolute paths are derived with joinAbs(rootPath, relPath) on demand.
//   - The hidden-files toggle is dropped: the fileReferences listing skips
//     dotfiles by design.
//   - Registration priorities are explicit (-1) — packaged plugins do not get
//     the dynamic guard's auto-assigned shadowing ranks.

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

function newController() {
  if (typeof AbortController !== 'undefined') return new AbortController()
  const signal = { aborted: false }
  return { signal, abort: () => { signal.aborted = true } }
}

function insertCss(cssText) {
  try {
    if (typeof document === 'undefined') return () => {}
    const style = document.createElement('style')
    style.setAttribute('data-plugin', 'dsh-sidebar-live')
    style.textContent = cssText
    document.head.appendChild(style)
    return () => { if (style.parentNode) style.parentNode.removeChild(style) }
  } catch (e) {
    return () => {}
  }
}

const errorText = (err) => (err && err.message ? String(err.message) : String(err))

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
  folderOpen: 'M2 4.5 A1.5 1.5 0 0 1 3.5 3 H5.8 L7.3 4.5 H10.3 L11 6.2 H14 L13.4 11.5 A1.5 1.5 0 0 1 11.9 13 H3.5 A1.5 1.5 0 0 1 2 11.5 Z',
  file: 'M4 2 H9 L12 5 V12.5 A1.5 1.5 0 0 1 10.5 14 H4 A1.5 1.5 0 0 1 2.5 12.5 V3.5 A1.5 1.5 0 0 1 4 2 Z M9 2 V5 H12',
  refresh: 'M13.5 8 A5.5 5.5 0 1 1 11 4.3 M13.5 3 V5.5 H11',
  panelLeft: 'M6 2.5 H4.5 A1.5 1.5 0 0 0 3 4 V12 A1.5 1.5 0 0 0 4.5 13.5 H6 Z M6 2.5 V13.5 M13.5 2.5 H11.5 V13.5 H13.5 Z',
  chat: 'M2.5 4 A1.5 1.5 0 0 1 4 2.5 H12 A1.5 1.5 0 0 1 13.5 4 V9 A1.5 1.5 0 0 1 12 10.5 H7 L4 13.5 V10.5 H4 A1.5 1.5 0 0 1 2.5 9 Z',
  plus: 'M8 3 V13 M3 8 H13',
}

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
.dshsb-group{display:flex;align-items:center;gap:4px;width:100%;height:34px;padding:0 8px;box-sizing:border-box;border:none;background:transparent;cursor:pointer;color:var(--dsw-alias-label-secondary);font-size:13px;text-align:left;border-radius:8px}
.dshsb-group:hover{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary)}
.dshsb-group-fold{flex:none;color:var(--dsw-alias-label-secondary)}
.dshsb-group-chev{flex:none;color:var(--dsw-alias-label-secondary);transition:transform .15s ease}
.dshsb-group-chev-open{transform:rotate(90deg)}
.dshsb-group-title{flex:1;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-weight:600}
.dshsb-group-count{flex:none;font-size:11px;opacity:.75}
.dshsb-sessrow{display:flex;align-items:center;gap:4px;width:100%;height:34px;padding:0 8px 0 8px;box-sizing:border-box;border:none;background:transparent;cursor:pointer;color:var(--dsw-alias-label-secondary);font-size:13px;text-align:left;border-radius:8px}
.dshsb-sessrow:hover{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary)}
.dshsb-sessrow-active,.dshsb-sessrow-active:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.dshsb-sessdot{flex:none;width:16px;display:inline-flex;align-items:center;justify-content:flex-start}
.dshsb-sessdot-on{width:8px;height:8px;border-radius:50%;background:var(--dsw-alias-state-success-primary)}
.dshsb-sessname{flex:1;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.dshsb-sessmeta{flex:none;font-size:11px;opacity:.75;max-width:45%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.dshsb-menu{position:fixed;z-index:10000;min-width:160px;padding:4px;border-radius:8px;background:var(--dsw-alias-bg-overlay);border:1px solid var(--dsw-alias-border-l1);box-shadow:0 6px 20px rgba(0,0,0,.18);font-size:13px;color:var(--dsw-alias-label-primary)}
.dshsb-menu-item{display:flex;align-items:center;gap:8px;width:100%;padding:6px 10px;border:none;border-radius:6px;background:transparent;cursor:pointer;color:var(--dsw-alias-label-secondary);text-align:left;font-size:13px;font-family:inherit}
.dshsb-menu-item:hover{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary)}
`

function joinAbs(root, rel) {
  if (typeof rel !== 'string' || rel === '') return root || ''
  return (root || '').replace(/[/\\]+$/, '') + '/' + rel
}

// ---- clipboard helpers ----
function fallbackCopy(text) {
  try {
    if (typeof document === 'undefined') return
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
  } catch (e) { /* best-effort */ }
}
function copyText(text) {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(text).catch(() => { fallbackCopy(text) })
      return
    }
  } catch (e) { /* fall through */ }
  fallbackCopy(text)
}

// ---- @file mention grammar (dsh-file-reference formatFileMention) ----
function formatFileMention(path, kind) {
  if (typeof path !== 'string' || path === '') return undefined
  const p = kind === 'directory' ? path.replace(/[/\\]+$/, '') + '/' : path
  if (/[\u0000-\u001f\u007f-\u009f"]/u.test(p)) return undefined
  const quoted = /\s/u.test(p)
  if (!quoted) return '@' + p
  if (kind === 'directory') return '@"' + p
  return '@"' + p + '"'
}
function basenamePath(path) {
  if (typeof path !== 'string' || path === '') return ''
  const parts = path.replace(/[/\\]+$/, '').split(/[/\\]/)
  return parts[parts.length - 1] || ''
}
// Add a path to the current session's composer as a native `@file` mention:
// files become a real chip occurrence (insertReference, appearance 'file'),
// directories the plain `@dir/` text — mirroring the shipped @ source.
function addPathToSession(path, kind, currentId) {
  const mention = formatFileMention(path, kind)
  if (mention === undefined) return
  const conversation = pluginCtx.get('conversation')
  const sessionsSvc = pluginCtx.get('sessions')
  if (!conversation || !sessionsSvc || typeof conversation.input !== 'object') return
  if (currentId === undefined) return
  let binding
  try { binding = sessionsSvc.binding(currentId) } catch (e) { return }
  if (!binding || !binding.ctx) return
  let input
  try { input = conversation.input.for(binding.ctx) } catch (e) { return }
  if (!input) return

  const snapshot = () => {
    try {
      const s = input.state && typeof input.state.getSnapshot === 'function' ? input.state.getSnapshot() : null
      return { draft: s && typeof s.draft === 'string' ? s.draft : '', rev: s && typeof s.draftRev === 'number' ? s.draftRev : 0 }
    } catch (e) { return { draft: '', rev: 0 } }
  }

  if (kind === 'file' && input.insertReference && typeof input.insertReference === 'function') {
    // Real @file chip: mint one occurrence at the end of the draft. A
    // separating space is folded in first so the chip does not abut text.
    let state = snapshot()
    if (state.draft !== '' && !/\s$/.test(state.draft)) {
      try { input.setDraft(state.draft + ' ') } catch (e) { /* ignore */ }
      state = snapshot()
    }
    const span = { start: state.draft.length, end: state.draft.length, draftRev: state.rev }
    const ref = { source: 'reference', ref: mention, label: basenamePath(path), appearance: 'file', clipboardText: mention }
    try { input.insertReference(ref, span) } catch (e) { /* ignore */ }
    return
  }
  // Directory (or fallback): plain `@dir/` text append.
  const cur = snapshot()
  const text = cur.draft === '' ? mention : cur.draft.replace(/\s+$/, '') + ' ' + mention
  try { input.setDraft(text) } catch (e) { /* ignore */ }
}

// Tree root: the CURRENT session's cwd (fileReferences bounds discovery to the
// session cwd, so there is no recent-workspace fallback in this package).
function deriveRootPath(sessions) {
  const s = sessions || {}
  const currentId = s.current
  const byId = s.byId || {}
  if (currentId !== undefined && byId[currentId] && typeof byId[currentId].cwd === 'string') {
    return byId[currentId].cwd
  }
  return undefined
}

// Module-scope plugin context (set by apply) and the panel id set the shell
// validates persisted selections against.
let pluginCtx = null
const KNOWN_PANELS = ['sessions', 'explorer']

// ---- sidebar shell (reshadows the layout-owned `sidebar` slot) ----
function SidebarShell(props) {
  const collapsed = !!props.collapsed
  const [activePanelId, setActivePanelId] = React.useState(() => {
    const saved = readJSON('dsh.sidebar.view.v1')
    const id = saved && typeof saved.activePanelId === 'string' ? saved.activePanelId : 'sessions'
    return KNOWN_PANELS.indexOf(id) !== -1 ? id : 'sessions'
  })
  const selectPanel = React.useCallback((id) => {
    setActivePanelId(id)
    writeJSON('dsh.sidebar.view.v1', { activePanelId: id })
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

// ---- sessions panel: collapsible workspace tree ----
function basename(path) {
  if (typeof path !== 'string' || path === '') return undefined
  const trimmed = path.replace(/[/\\]+$/, '')
  const parts = trimmed.split(/[/\\]/)
  return parts[parts.length - 1]
}
function sessionVisible(summary, current, archived) {
  return summary.origin !== 'subagent'
    && !archived.has(summary.id)
    && (!summary.blank || summary.id === current)
}
function buildSessionsTree(sessions, items, archived, current) {
  const byId = sessions.byId || {}
  const groups = []
  const accounted = new Set()
  for (const workspace of items) {
    const members = []
    for (const id of (workspace.sessionIds || [])) {
      const summary = byId[id]
      if (summary === undefined) continue
      accounted.add(id)
      if (!sessionVisible(summary, current, archived)) continue
      members.push(summary)
    }
    groups.push({
      key: workspace.workspaceId,
      label: workspace.title || basename(workspace.path) || '工作区',
      members,
    })
  }
  const stray = (sessions.ids || [])
    .map(id => byId[id])
    .filter(summary => summary !== undefined
      && !accounted.has(summary.id)
      && sessionVisible(summary, current, archived))
  if (stray.length > 0) {
    groups.push({ key: '', label: '未分组', members: stray })
  }
  return groups
}
function relativeTimeLabel(updatedAt) {
  const diff = Math.max(0, Date.now() - (typeof updatedAt === 'number' ? updatedAt : 0))
  const MIN = 60000
  const HOUR = 3600000
  const DAY = 86400000
  if (diff < MIN) return '刚刚'
  if (diff < HOUR) return Math.floor(diff / MIN) + ' 分钟前'
  if (diff < DAY) return Math.floor(diff / HOUR) + ' 小时前'
  if (diff < 30 * DAY) return Math.floor(diff / DAY) + ' 天前'
  if (diff < 365 * DAY) return Math.floor(diff / (30 * DAY)) + ' 个月前'
  return Math.floor(diff / (365 * DAY)) + ' 年前'
}
function SessionsPanel(props) {
  const sessions = props.useSessions((s) => s)
  const wss = props.useWorkspaces((s) => s)
  const [groupExpansion, setGroupExpansion] = React.useState(() => {
    const saved = readJSON('dsh.sidebar.sessions.groups.v1')
    return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {}
  })
  React.useEffect(() => {
    writeJSON('dsh.sidebar.sessions.groups.v1', groupExpansion)
  }, [groupExpansion])

  const s = sessions || {}
  const w = wss || {}
  const archived = new Set(w.archivedSessionIds || [])
  const current = s.current
  const items = w.items || []
  const groups = buildSessionsTree(s, items, archived, current)

  const currentGroupKey = (() => {
    if (current === undefined) return undefined
    for (const g of groups) {
      if (g.key === '') continue
      if (g.members.some(m => m.id === current)) return g.key
    }
    return groups.some(g => g.key === '') ? '' : undefined
  })()
  React.useEffect(() => {
    if (currentGroupKey === undefined) return
    if (Object.prototype.hasOwnProperty.call(groupExpansion, currentGroupKey)) return
    setGroupExpansion(prev => Object.assign({}, prev, { [currentGroupKey]: true }))
  }, [currentGroupKey, groupExpansion])

  if (props.activePanelId !== props.panelId) return null

  const sessionsSvc = pluginCtx.get('sessions')
  const wsSvc = pluginCtx.get('workspaces')
  const openSession = (id) => { if (sessionsSvc) sessionsSvc.open(id) }
  const startNew = () => { if (wsSvc && typeof wsSvc.startSession === 'function') wsSvc.startSession() }
  const toggleGroup = (key) => {
    setGroupExpansion(prev => {
      const next = Object.assign({}, prev)
      if (next[key] === true) delete next[key]
      else next[key] = true
      return next
    })
  }

  const rows = []
  if (groups.length === 0) {
    rows.push(React.createElement('div', { key: 'empty', className: 'dshsb-empty' }, '还没有会话或工作区。'))
  } else {
    groups.forEach((group) => {
      const expanded = groupExpansion[group.key] === true
      rows.push(React.createElement('button', {
        key: 'g-' + group.key,
        type: 'button',
        className: 'dshsb-group',
        role: 'treeitem',
        'aria-expanded': expanded,
        onClick: () => { toggleGroup(group.key) },
      },
        React.createElement(SvgIcon, { className: 'dshsb-group-fold', d: expanded ? ICONS.folderOpen : ICONS.folder, size: 16 }),
        React.createElement(SvgIcon, { className: expanded ? 'dshsb-group-chev dshsb-group-chev-open' : 'dshsb-group-chev', d: ICONS.chevronRight, size: 14 }),
        React.createElement('span', { className: 'dshsb-group-title' }, group.label),
        React.createElement('span', { className: 'dshsb-group-count' }, String(group.members.length))))
      if (expanded) {
        group.members.forEach((m) => {
          const active = m.id === current
          const showDot = m.running === true || m.completed === true
          rows.push(React.createElement('button', {
            key: 's-' + m.id,
            type: 'button',
            className: active ? 'dshsb-sessrow dshsb-sessrow-active' : 'dshsb-sessrow',
            role: 'treeitem',
            'aria-selected': active,
            onClick: () => { openSession(m.id) },
          },
            React.createElement('span', { className: 'dshsb-sessdot' },
              showDot ? React.createElement('span', { className: 'dshsb-sessdot-on' }) : null),
            React.createElement('span', { className: 'dshsb-sessname' }, m.blank ? '新会话' : m.displayTitle),
            m.blank ? null : React.createElement('span', { className: 'dshsb-sessmeta' }, relativeTimeLabel(m.updatedAt))))
        })
      }
    })
  }

  return React.createElement('div', { className: 'dshsb-panelroot' },
    React.createElement('div', { className: 'dshsb-header' },
      React.createElement('span', { className: 'dshsb-title' }, '会话'),
      React.createElement('div', { className: 'dshsb-headeractions' },
        React.createElement('button', {
          type: 'button',
          className: 'dshsb-headbtn',
          title: '新建会话',
          'aria-label': '新建会话',
          onClick: startNew,
        }, React.createElement(SvgIcon, { d: ICONS.plus, size: 16 })))),
    React.createElement('div', { className: 'dshsb-tree' }, rows))
}

// ---- explorer viewing store (relative-path keys) ----
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
    case 'invalidate':
      return Object.assign({}, state, { childrenByPath: {}, loadingPaths: [], errorByPath: {}, truncatedByPath: {} })
    default:
      return state
  }
}
function initialView() {
  return {
    expansion: {},
    childrenByPath: {},
    loadingPaths: [],
    errorByPath: {},
    truncatedByPath: {},
  }
}

// ---- one directory level of the tree (relDir = relative directory, '' = root) ----
function DirectoryChildren(props) {
  const path = props.path
  const depth = props.depth
  const view = props.view
  const load = props.load
  const abort = props.abort
  const toggle = props.toggle
  const openFile = props.openFile
  const onContextMenu = props.onContextMenu

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
  if (children.length === 0) {
    return React.createElement('div', { className: 'dshsb-status', style: indent }, '此文件夹为空')
  }
  const rows = []
  children.forEach((entry) => {
    if (entry.kind === 'directory') {
      const expanded = view.expansion[entry.relPath] === true
      rows.push(React.createElement('div', { key: entry.relPath },
        React.createElement('button', {
          type: 'button',
          className: 'dshsb-row',
          style: indent,
          'aria-expanded': expanded,
          onClick: () => { toggle(entry.relPath, !expanded) },
          onContextMenu: (e) => { e.preventDefault(); onContextMenu(entry.relPath, 'directory', e.clientX, e.clientY) },
        },
          React.createElement(SvgIcon, { className: 'dshsb-chev', d: expanded ? ICONS.chevronDown : ICONS.chevronRight, size: 14 }),
          React.createElement(SvgIcon, { className: 'dshsb-rowicon', d: ICONS.folder, size: 16 }),
          React.createElement('span', { className: 'dshsb-name' }, entry.name)),
        expanded
          ? React.createElement(DirectoryChildren, { path: entry.relPath, depth: depth + 1, view, load, abort, toggle, openFile, onContextMenu })
          : null))
    } else {
      rows.push(React.createElement('button', {
        key: entry.relPath,
        type: 'button',
        className: 'dshsb-row',
        style: indent,
        onClick: () => { openFile(entry.relPath) },
        onContextMenu: (e) => { e.preventDefault(); onContextMenu(entry.relPath, 'file', e.clientX, e.clientY) },
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

// ---- explorer row context menu (relPath-based) ----
function ExplorerMenu({ menu, rootPath, currentId, onClose }) {
  if (menu === null) return null
  const vw = typeof window !== 'undefined' ? window.innerWidth : 480
  const vh = typeof window !== 'undefined' ? window.innerHeight : 360
  const x = Math.max(4, Math.min(menu.x, vw - 190))
  const y = Math.max(4, Math.min(menu.y, vh - 128))
  const abs = joinAbs(rootPath, menu.relPath)
  const copyAbs = () => { copyText(abs); onClose() }
  const copyRel = () => { copyText(menu.relPath); onClose() }
  const addToSession = () => { addPathToSession(abs, menu.kind, currentId); onClose() }
  return React.createElement('div', {
    className: 'dshsb-menu',
    style: { left: x, top: y },
    onContextMenu: (e) => { e.preventDefault() },
  },
    React.createElement('button', { type: 'button', className: 'dshsb-menu-item', onClick: copyAbs }, '复制路径'),
    React.createElement('button', { type: 'button', className: 'dshsb-menu-item', onClick: copyRel }, '复制相对路径'),
    React.createElement('button', { type: 'button', className: 'dshsb-menu-item', onClick: addToSession }, '添加到会话'))
}

function ExplorerPanel(props) {
  const sessions = props.useSessions((s) => s)
  const wss = props.useWorkspaces((s) => s)
  const [view, dispatch] = React.useReducer(viewReducer, undefined, initialView)
  const controllersRef = React.useRef()
  if (controllersRef.current === undefined) controllersRef.current = new Map()
  const controllers = controllersRef.current

  const rootPath = React.useMemo(() => deriveRootPath(sessions), [sessions])

  // Relative keys would go stale across a session switch: drop the cache and
  // abort in-flight requests whenever the root cwd changes.
  const prevRoot = React.useRef(rootPath)
  React.useEffect(() => {
    if (prevRoot.current === rootPath) return
    prevRoot.current = rootPath
    for (const controller of controllers.values()) controller.abort()
    controllers.clear()
    dispatch({ type: 'invalidate' })
  }, [rootPath, controllers])

  const load = React.useCallback((relDir) => {
    if (controllers.has(relDir)) return
    const controller = newController()
    controllers.set(relDir, controller)
    dispatch({ type: 'setLoading', path: relDir, loading: true })
    props.listDirectory(sessions.current, relDir, controller.signal).then((entries) => {
      if (controller.signal.aborted) return
      dispatch({ type: 'setChildren', path: relDir, entries, truncated: false })
    }, (reason) => {
      if (controller.signal.aborted) return
      dispatch({ type: 'setError', path: relDir, message: errorText(reason) })
    }).then(() => { controllers.delete(relDir) })
  }, [props, sessions.current, controllers])

  const abort = React.useCallback((relDir) => {
    const controller = controllers.get(relDir)
    if (controller === undefined) return
    controllers.delete(relDir)
    controller.abort()
    dispatch({ type: 'setLoading', path: relDir, loading: false })
  }, [controllers])

  React.useEffect(() => {
    const pending = controllers
    return () => {
      for (const [relDir, controller] of pending) {
        controller.abort()
        dispatch({ type: 'setLoading', path: relDir, loading: false })
      }
      pending.clear()
    }
  }, [controllers])

  const toggle = React.useCallback((relDir, expanded) => { dispatch({ type: 'setExpanded', path: relDir, expanded }) }, [])
  const openFile = React.useCallback((relPath) => {
    props.openPath(joinAbs(rootPath, relPath)).catch(() => {})
  }, [props, rootPath])
  const refresh = React.useCallback(() => {
    for (const controller of controllers.values()) controller.abort()
    controllers.clear()
    dispatch({ type: 'invalidate' })
  }, [controllers])

  // Right-click context menu state (relPath + pointer position).
  const [menu, setMenu] = React.useState(null)
  const openMenu = React.useCallback((relPath, kind, x, y) => { setMenu({ relPath, kind, x, y }) }, [])
  const closeMenu = React.useCallback(() => { setMenu(null) }, [])
  React.useEffect(() => {
    if (props.activePanelId !== props.panelId) closeMenu()
  }, [props.activePanelId, props.panelId, closeMenu])
  React.useEffect(() => {
    if (menu === null) return
    const isInside = (target) => target && typeof target.closest === 'function' && target.closest('.dshsb-menu') !== null
    const onDown = (e) => { if (!isInside(e.target)) closeMenu() }
    const onKey = (e) => { if (e.key === 'Escape') closeMenu() }
    if (typeof window !== 'undefined') {
      window.addEventListener('mousedown', onDown, true)
      window.addEventListener('keydown', onKey, true)
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('mousedown', onDown, true)
        window.removeEventListener('keydown', onKey, true)
      }
    }
  }, [menu, closeMenu])

  if (props.activePanelId !== props.panelId) return null

  const header = React.createElement('div', { className: 'dshsb-header' },
    React.createElement('span', { className: 'dshsb-title' }, '资源管理器'),
    React.createElement('div', { className: 'dshsb-headeractions' },
      React.createElement('button', {
        type: 'button',
        className: 'dshsb-headbtn',
        title: '刷新',
        'aria-label': '刷新',
        onClick: refresh,
      }, React.createElement(SvgIcon, { d: ICONS.refresh, size: 16 }))))

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
    React.createElement('div', { className: 'dshsb-tree', onScroll: closeMenu },
      React.createElement(DirectoryChildren, { path: '', depth: 0, view, load, abort, toggle, openFile, onContextMenu: openMenu })),
    React.createElement(ExplorerMenu, { menu, rootPath, currentId: sessions.current, onClose: closeMenu }))
}

// ---- plugin apply ----
function apply(ctx) {
  pluginCtx = ctx
  const slots = ctx.get('slots')
  if (slots === undefined) return
  const disposeCss = insertCss(CSS)

  // One level of the current session's cwd via the host fileReferences Remote.
  // relDir '' = root; any other value is a relative directory path.
  const listDirectory = (sessionId, relDir, signal) => {
    const remote = ctx.get('remote')
    if (!remote || !remote.fileReferences || typeof remote.fileReferences.list !== 'function') {
      return Promise.reject(new Error('文件引用服务不可用'))
    }
    const query = relDir === '' ? '' : relDir + '/'
    return remote.fileReferences.list(sessionId, query, signal).then((result) => {
      if (signal && signal.aborted) throw new Error('已取消')
      if (!result || result.ok !== true) {
        const msg = result && result.error ? (result.error.message || String(result.error)) : '目录读取失败'
        throw new Error(msg)
      }
      const items = result.value || []
      return items.map((c) => ({
        name: c.path.slice(c.path.lastIndexOf('/') + 1),
        relPath: c.path,
        kind: c.kind,
        hidden: false,
      }))
    })
  }
  const openPath = (path) => {
    const w = ctx.get('workspaces')
    if (w && typeof w.openPath === 'function') return w.openPath(path)
    return Promise.reject(new Error('工作区服务不可用'))
  }

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
    disposers.push(slots.register({ name: 'sidebar.activity', id: 'sessions', order: 1, priority: -1, inject: () => ({ panelId: 'sessions' }) }, ActivityIcon))
    disposers.push(slots.register({ name: 'sidebar.activity', id: 'explorer', order: 2, priority: -1, inject: () => ({ panelId: 'explorer' }) }, ActivityIcon))
    disposers.push(slots.register({ name: 'sidebar.panel', id: 'sessions', order: 1, priority: -1, inject: () => ({ panelId: 'sessions' }) }, SessionsPanel))
    disposers.push(slots.register({ name: 'sidebar.panel', id: 'explorer', order: 2, priority: -1, inject: () => ({ panelId: 'explorer', listDirectory, openPath }) }, ExplorerPanel))
    return () => {
      for (const d of disposers) {
        try { if (typeof d === 'function') d() } catch (e) { /* noop */ }
      }
    }
  })
}
