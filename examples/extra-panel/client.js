// examples/extra-panel — Client half: how to add a THIRD left-sidebar tab.
//
// The left tab bar in the current dsh GUI is a pair of additive list slots:
//   sidebar.activity  (rail icon strip, one entry per tab)
//   sidebar.panel     (content area, one entry per tab)
// A tab is just two entries with the SAME id (here 'pins') registered into
// both slots. The shell (dsh-sidebar-live's SidebarShell, installed in
// `sidebar.workspaces`) renders every entry and owns the active state:
//   - activity entries receive  { panelId, wide, activePanelId, selectPanel }
//   - panel entries receive     { panelId, wide, activePanelId, ...injected }
//     and must render null while `activePanelId !== panelId` (self-gating).
//
// This file is the exact `code.client` body handed to cordis_define. Plain JS
// only: no imports, no TypeScript, no JSX (use React.createElement). Builtins:
// ctx / React / host / styles / console.

return {
  apply(ctx) {
    const slots = ctx.get('slots')
    if (slots === undefined) return

    const PANEL_ID = 'pins'
    const PINS_KEY = 'dsh.demo.pins.v1'

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
      } catch (e) { /* best-effort */ }
    }

    // ---- inline SVG icon (no ui-primitives import in a runtime plugin) ----
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
        'aria-hidden': true,
      }, React.createElement('path', { d: props.d }))
    }
    const ICONS = {
      star: 'M8 2 L9.7 5.7 L13.8 6.2 L10.8 9.1 L11.7 13.2 L8 11.2 L4.3 13.2 L5.2 9.1 L2.2 6.2 L6.3 5.7 Z',
      pin: 'M8 3.5 L12.5 8 L10 9.5 L9 12 L4 7 L6.5 5.5 Z',
      trash: 'M3 4.5 H13 M6 4.5 V3.5 A1 1 0 0 1 7 2.5 H9 A1 1 0 0 1 10 3.5 V4.5 M4.5 4.5 L5.2 12.5 A1 1 0 0 0 6.2 13.5 H9.8 A1 1 0 0 0 10.8 12.5 L11.5 4.5',
      folder: 'M2 4.5 A1.5 1.5 0 0 1 3.5 3 H5.8 L7.3 4.5 H12.5 A1.5 1.5 0 0 1 14 6 V11.5 A1.5 1.5 0 0 1 12.5 13 H3.5 A1.5 1.5 0 0 1 2 11.5 Z',
    }

    // ---- styles (theme tokens only, own prefix so nothing collides) ----
    const CSS = `
.dshpin-root{flex:1;min-height:0;display:flex;flex-direction:column;box-sizing:border-box;padding:2px 4px 6px 0}
.dshpin-header{flex:none;display:flex;align-items:center;justify-content:space-between;gap:4px;height:32px;padding-left:8px;box-sizing:border-box;color:var(--dsw-alias-label-secondary)}
.dshpin-title{overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:13px;font-weight:600}
.dshpin-add{flex:none;display:inline-flex;align-items:center;justify-content:center;gap:4px;height:26px;border:none;border-radius:8px;padding:0 8px;background:transparent;cursor:pointer;color:var(--dsw-alias-label-secondary);font-size:12px}
.dshpin-add:hover{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary)}
.dshpin-list{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden}
.dshpin-row{display:flex;align-items:center;gap:6px;width:100%;height:30px;border:none;border-radius:8px;padding:0 6px 0 8px;box-sizing:border-box;background:transparent;cursor:pointer;color:var(--dsw-alias-label-secondary);font-size:13px;text-align:left}
.dshpin-row:hover{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary)}
.dshpin-rowicon{flex:none;color:var(--dsw-alias-label-secondary)}
.dshpin-name{flex:1;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.dshpin-path{flex:none;max-width:45%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:11px;opacity:.7}
.dshpin-unpin{flex:none;display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border:none;border-radius:50%;padding:0;background:transparent;cursor:pointer;color:var(--dsw-alias-label-secondary)}
.dshpin-unpin:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.dshpin-empty{padding:16px 12px;color:var(--dsw-alias-label-secondary);font-size:13px}
.dshpin-hint{margin-top:4px;font-size:12px;opacity:.75}
`
    const disposeCss = styles.insert(CSS)

    // ---- data verbs (all client-side for this demo) ----
    function openPath(path) {
      const w = ctx.get('workspaces')
      if (w && typeof w.openPath === 'function') return w.openPath(path)
      return Promise.reject(new Error('工作区服务不可用'))
    }
    function listPins() {
      const saved = readJSON(PINS_KEY)
      return Array.isArray(saved) ? saved.filter((p) => p && typeof p.path === 'string') : []
    }
    function savePins(pins) {
      writeJSON(PINS_KEY, pins)
    }

    // ---- activity icon entry ----
    // Receives { panelId, wide, activePanelId, selectPanel } from the shell.
    function PinsIcon(props) {
      const active = props.activePanelId === props.panelId
      return React.createElement('button', {
        type: 'button',
        className: active ? 'dshsb-icon dshsb-icon-active' : 'dshsb-icon',
        title: '收藏',
        'aria-label': '收藏',
        'aria-pressed': active,
        onClick: () => { props.selectPanel(props.panelId) },
      }, React.createElement(SvgIcon, { d: ICONS.star, size: props.wide ? 16 : 18 }))
    }

    // ---- panel entry ----
    // Self-gates: renders nothing while another tab is active. Standard props
    // useSessions / useWorkspaces are framework global hooks passed by the shell.
    function PinsPanel(props) {
      if (props.activePanelId !== props.panelId) return null

      const [pins, setPins] = React.useState(listPins)

      const sessions = props.useSessions ? props.useSessions((s) => s) : undefined
      const wss = props.useWorkspaces ? props.useWorkspaces((s) => s) : undefined
      const current = sessions && sessions.current
      const items = (wss && wss.items) || []
      const currentWs = items.find((it) => (it.sessionIds || []).indexOf(current) !== -1)
      const currentPath = currentWs && currentWs.path

      const addCurrent = () => {
        if (typeof currentPath !== 'string' || currentPath === '') return
        const next = listPins().filter((p) => p.path !== currentPath)
        next.push({ path: currentPath, addedAt: Date.now() })
        savePins(next)
        setPins(next)
      }
      const unpin = (path) => {
        const next = listPins().filter((p) => p.path !== path)
        savePins(next)
        setPins(next)
      }

      const header = React.createElement('div', { className: 'dshpin-header' },
        React.createElement('div', { className: 'dshpin-title' }, '收藏'),
        React.createElement('button', {
          type: 'button',
          className: 'dshpin-add',
          title: currentPath ? '收藏当前工作区' : '当前没有可收藏的工作区',
          disabled: !currentPath,
          onClick: addCurrent,
        }, '+ 收藏当前工作区'))

      const rows = pins.map((pin) => React.createElement('div', {
        key: pin.path,
        className: 'dshpin-row',
        onClick: () => { openPath(pin.path).catch(() => {}) },
      },
        React.createElement(SvgIcon, { d: ICONS.folder, size: 14, className: 'dshpin-rowicon' }),
        React.createElement('span', { className: 'dshpin-name' }, pin.path.split(/[/\\]/).pop() || pin.path),
        React.createElement('span', { className: 'dshpin-path' }, pin.path),
        React.createElement('button', {
          type: 'button',
          className: 'dshpin-unpin',
          title: '取消收藏',
          'aria-label': '取消收藏',
          onClick: (e) => { e.stopPropagation(); unpin(pin.path) },
        }, React.createElement(SvgIcon, { d: ICONS.trash, size: 12 }))))

      const body = pins.length === 0
        ? React.createElement('div', { className: 'dshpin-empty' },
            React.createElement('div', null, '还没有收藏的路径'),
            React.createElement('div', { className: 'dshpin-hint' },
              currentPath
                ? '点击右上角「+ 收藏当前工作区」，把当前会话的工作目录钉在这里；点条目即可在系统默认程序中打开。'
                : '打开或新建一个会话后，即可收藏其工作目录。'))
        : React.createElement('div', { className: 'dshpin-list' }, rows)

      return React.createElement('div', { className: 'dshpin-root' }, header, body)
    }

    // ---- registrations: wait for the shell's slot declarations, then add ----
    // `slots.inject` is the additive pattern: it fires only once the shell has
    // declared `sidebar.activity` / `sidebar.panel`, so this plugin is inert
    // (no errors) when no such shell is running.
    ctx.effect(() => {
      const disposers = [disposeCss]
      disposers.push(slots.inject('sidebar.activity', () => slots.register(
        { name: 'sidebar.activity', id: PANEL_ID, order: 3, priority: -1, inject: () => ({ panelId: PANEL_ID }) },
        PinsIcon,
      )))
      disposers.push(slots.inject('sidebar.panel', () => slots.register(
        { name: 'sidebar.panel', id: PANEL_ID, order: 3, priority: -1, inject: () => ({ panelId: PANEL_ID }) },
        PinsPanel,
      )))
      return () => {
        for (const d of disposers) {
          try { if (typeof d === 'function') d() } catch (e) { /* noop */ }
        }
      }
    })
  },
}
