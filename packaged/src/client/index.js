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
  globe: 'M8 2 A6 6 0 1 1 8 14 A6 6 0 0 1 8 2 Z M2.5 8 H13.5 M8 2 C10 4.5 10 11.5 8 14 C6 11.5 6 4.5 8 2 Z',
  back: 'M9.5 3.5 L5 8 L9.5 12.5',
  forward: 'M6.5 3.5 L11 8 L6.5 12.5',
  reload: 'M13.5 8 A5.5 5.5 0 1 1 11 4.3 M13.5 3 V5.5 H11',
  stop: 'M5 5 L11 11 M11 5 L5 11',
  x: 'M4 4 L12 12 M12 4 L4 12',
  crosshair: 'M8 2.2 C4.8 2.2 2.2 4.8 2.2 8 C2.2 11.2 4.8 13.8 8 13.8 C11.2 13.8 13.8 11.2 13.8 8 C13.8 4.8 11.2 2.2 8 2.2 Z M8 4.2 V6 M8 10 V11.8 M4.2 8 H6 M10 8 H11.8',
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
.dshpv-root{flex:1;min-height:0;display:flex;flex-direction:column;box-sizing:border-box;background:var(--dsw-alias-bg-base)}
.dshpv-modetabs{flex:none;display:flex;align-items:center;gap:2px;padding:6px 10px;border-bottom:1px solid var(--dsw-alias-border-l1);box-sizing:border-box}
.dshpv-filehead{flex:1;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:12.5px;color:var(--dsw-alias-label-secondary);opacity:.85;padding:0 2px}
.dshpv-status{display:flex;align-items:center;gap:8px;padding:14px 16px;color:var(--dsw-alias-label-secondary);font-size:13px}
.dshpv-error{color:var(--dsw-alias-state-error-primary);overflow-wrap:break-word}
.dshpv-empty{padding:40px 20px;text-align:center;color:var(--dsw-alias-label-secondary);font-size:13px}
.dshpv-emptyhint{margin-top:6px;font-size:12px;opacity:.7}
.dshpv-imgwrap{flex:1;min-height:0;overflow:auto;display:flex;align-items:flex-start;justify-content:center;padding:16px;box-sizing:border-box}
.dshpv-img{max-width:100%;max-height:100%;object-fit:contain;border-radius:6px}
.dshpv-textwrap{flex:1;min-height:0;overflow:auto;box-sizing:border-box}
.dshpv-pre{margin:0;padding:16px;font-family:var(--ds-font-family-code);font-size:12.5px;line-height:1.6;color:var(--dsw-alias-label-primary);white-space:pre-wrap;word-break:break-word}
.dshpv-md{padding:12px 20px 24px;font-size:13.5px;line-height:1.7;color:var(--dsw-alias-label-primary)}
.dshpv-md h1,.dshpv-md h2,.dshpv-md h3,.dshpv-md h4,.dshpv-md h5,.dshpv-md h6{margin:1em 0 .5em;line-height:1.3;color:var(--dsw-alias-label-primary)}
.dshpv-md h1{font-size:1.5em}.dshpv-md h2{font-size:1.3em}.dshpv-md h3{font-size:1.15em}
.dshpv-md p{margin:.6em 0}
.dshpv-md a{color:var(--dsw-alias-brand-primary)}
.dshpv-md code{font-family:var(--ds-font-family-code);font-size:.92em;background:var(--dsw-alias-bg-layer-1);padding:2px 5px;border-radius:5px}
.dshpv-md pre{background:var(--dsw-alias-bg-layer-1);border-radius:10px;padding:12px 14px;overflow-x:auto;margin:.8em 0}
.dshpv-md pre code{background:transparent;padding:0;font-size:12.5px;line-height:1.55;white-space:pre}
.dshpv-md ul,.dshpv-md ol{padding-left:1.6em;margin:.6em 0}
.dshpv-md li{margin:.25em 0}
.dshpv-md blockquote{margin:.8em 0;padding:.2em 1em;border-left:3px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary)}
.dshpv-md hr{border:none;border-top:1px solid var(--dsw-alias-border-l1);margin:1.2em 0}
.dshpv-md table{border-collapse:collapse;margin:.8em 0;font-size:13px}
.dshpv-md th,.dshpv-md td{border:1px solid var(--dsw-alias-border-l1);padding:6px 10px;text-align:left}
.dshpv-md th{background:var(--dsw-alias-bg-layer-1)}
/* Floating preview overlay: used when the session is blank and the
   conversation view ring (with the 预览 tab) is not rendered at all. */
.dshpv-overlay{position:fixed;inset:0;z-index:20000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.35)}
.dshpv-overlaybox{display:flex;flex-direction:column;width:min(720px,calc(100vw - 48px));height:min(560px,calc(100vh - 96px));border-radius:12px;background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);box-shadow:0 12px 40px rgba(0,0,0,.25);overflow:hidden}
.dshpv-overlayhead{flex:none;display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid var(--dsw-alias-border-l1);box-sizing:border-box}
.dshpv-overlaytitle{flex:1;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary)}
.dshpv-overlaynote{flex:none;font-size:11.5px;color:var(--dsw-alias-label-secondary);opacity:.8;white-space:nowrap}
.dshpv-overlayclose{flex:none;display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border:none;border-radius:50%;padding:0;background:transparent;cursor:pointer;color:var(--dsw-alias-label-secondary)}
.dshpv-overlayclose:hover{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary)}
.dshbr-btn{display:flex;align-items:center;justify-content:center;flex:none;border:none;background:transparent;cursor:pointer;padding:4px;border-radius:50%;color:inherit;opacity:.85;transition:background-color 120ms ease,opacity 120ms ease}
.dshbr-btn:hover:not(:disabled){background:rgba(77,107,254,.06);opacity:1}
.dshbr-btn:disabled{opacity:.35;cursor:default}
.dshbr-tab{display:flex;align-items:center;gap:6px;box-sizing:border-box;flex:1 1 auto;min-width:88px;max-width:132px;overflow:hidden;padding:3px 6px 3px 10px;border:1px solid rgba(127,127,127,.3);border-radius:9px;background:var(--dsw-alias-bg-base);box-shadow:0 1px 2px rgba(0,0,0,.05);cursor:pointer;color:inherit;font-size:12.5px;transition:background-color 120ms ease,box-shadow 120ms ease,border-color 120ms ease,flex-basis 240ms cubic-bezier(.16,.6,.3,1),max-width 240ms cubic-bezier(.16,.6,.3,1);user-select:none}
.dshbr-tab:hover{background:rgba(77,107,254,.06)}
.dshbr-tab.active{border-color:rgba(127,127,127,.45);box-shadow:0 1px 3px rgba(0,0,0,.09)}
/* 快进慢出：展开（进入编辑）与收起（失焦回缩）都用快速起步、缓收尾的曲线；
   收起比展开稍长，尾巴更柔和。flex-basis 必须一并过渡，否则收起会瞬间跳变。 */
.dshbr-tab.editing{cursor:text;flex-basis:220px;max-width:260px;transition:background-color 120ms ease,box-shadow 120ms ease,border-color 120ms ease,flex-basis 180ms cubic-bezier(.16,.6,.3,1),max-width 180ms cubic-bezier(.16,.6,.3,1)}
.dshbr-tab-title{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;opacity:.55;transition:opacity 120ms ease}
.dshbr-tab:hover .dshbr-tab-title{opacity:.85}
.dshbr-tab.active .dshbr-tab-title,.dshbr-tab.active:hover .dshbr-tab-title{opacity:1}
.dshbr-tab-input{flex:1;min-width:60px;border:none;outline:none;background:transparent;color:inherit;font:inherit;padding:0}
.dshbr-tab .dshbr-btn{padding:2px}
.dshbr-tab:not(.active):not(:hover) .dshbr-btn{opacity:.5}
/* 标注 (element-picking) toolbar button: brand-blue badge while armed. */
.dshbr-btn-picking{background:rgba(77,107,254,.28);opacity:1}
.dshbr-btn-picking:hover:not(:disabled){background:rgba(77,107,254,.34)}
/* Transient error/notice toast under the browser toolbar. */
.dshbr-toast{display:flex;align-items:center;gap:8px;flex:none;padding:7px 12px;font-size:13px;line-height:1.4;border-bottom:1px solid rgba(220,38,38,.3);background:rgba(220,38,38,.12);color:#dc2626}
.dshbr-toast-ok{border-bottom-color:rgba(22,163,74,.3);background:rgba(22,163,74,.1);color:#15803d}
/* Hide the composer while the 预览 (file/browser) view is active: the preview
   root only exists when the conversation view ring has this entry selected,
   so the seat reappears automatically when the user switches back to 对话. */
[data-conversation-scroll]:has(.dshpv-root) > [data-composer-seat]{display:none}
`

function joinAbs(root, rel) {
  if (typeof rel !== 'string' || rel === '') return root || ''
  return (root || '').replace(/[/\\]+$/, '') + '/' + rel
}

// ---- preview feature: loopback RPC to the host half ----
// The host half registers the `/preview-fs` channel (connection.rpc.handle);
// the browser half calls it with plain fetch using the same message shape as
// the connection rpc caller (createWebConnectionRpc), so no typert codegen is
// needed. `full.result` is the host handler's return value verbatim.
let rpcSeq = 0
function rpcCall(endpoint, payload) {
  const rpcId = 'pv' + (++rpcSeq) + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  return fetch('/preview-fs/' + endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId, method: endpoint, payload: payload || {} }),
  }).then((res) => {
    if (!res.ok) throw new Error('preview rpc transport: HTTP ' + res.status)
    return res.json()
  }).then((full) => {
    if (!full || full.rpcId !== rpcId) throw new Error('preview rpc id mismatch')
    return full.result
  })
}

// ---- previewable file detection (mirrors the host half's tables) ----
const PREVIEW_TEXT_EXT = {
  md: 1, markdown: 1, mdx: 1, yaml: 1, yml: 1, json: 1, toml: 1,
  txt: 1, text: 1, log: 1, csv: 1, tsv: 1, ini: 1, conf: 1, cfg: 1, env: 1,
  lock: 1, gitignore: 1, editorconfig: 1, dockerfile: 1, makefile: 1,
  ts: 1, tsx: 1, js: 1, jsx: 1, mjs: 1, cjs: 1, py: 1, rb: 1, go: 1, rs: 1,
  java: 1, kt: 1, swift: 1, c: 1, h: 1, cpp: 1, hpp: 1, cc: 1,
  css: 1, scss: 1, less: 1, html: 1, htm: 1, xml: 1,
  sh: 1, bash: 1, zsh: 1, fish: 1, sql: 1, graphql: 1, proto: 1,
  vue: 1, svelte: 1, gradle: 1,
}
const PREVIEW_IMG_EXT = { png: 1, jpg: 1, jpeg: 1, gif: 1, webp: 1, bmp: 1, svg: 1, ico: 1, avif: 1 }
function previewableOf(path) {
  const ext = (String(path).split('.').pop() || '').toLowerCase()
  if (PREVIEW_IMG_EXT[ext] === 1) return 'image'
  if (PREVIEW_TEXT_EXT[ext] === 1) return 'text'
  return null
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

// Reveal a path in the host's file manager (Finder / Explorer): the host
// half's `/preview-fs` 'reveal-path' endpoint spawns the platform reveal
// command. Best-effort like copyText — a failure only warns.
function revealInFileManager(path) {
  rpcCall('reveal-path', { path }).then((result) => {
    if (!result || result.ok !== true) {
      console.warn('reveal-path rejected:', result && result.error ? result.error : result)
    }
  }).catch((reason) => { console.warn('reveal-path failed:', reason) })
}
// The reveal verb labels itself after the host's file manager; the desktop
// host and this page share the machine, so the client platform is the host's.
function revealMenuLabel() {
  if (typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform || navigator.userAgent || '')) {
    return '在 Finder 中显示'
  }
  if (typeof navigator !== 'undefined' && /Win/i.test(navigator.platform || navigator.userAgent || '')) {
    return '在资源管理器中显示'
  }
  return '打开所在文件夹'
}
// Add a path to the current session's composer as a native `@file` mention:
// files become a real chip occurrence (insertReference, appearance 'file'),
// directories the plain `@dir/` text — mirroring the shipped @ source.
function addPathToSession(path, kind, currentId) {
  const mention = formatFileMention(path, kind)
  if (mention === undefined) return
  // Traversing conversation.input can hit the cordis inject guard; degrade
  // gracefully (the menu item simply does nothing when unavailable).
  let conversationInput = null
  try {
    const conversation = pluginCtx.get('conversation')
    if (conversation && typeof conversation.input === 'object') conversationInput = conversation.input
  } catch (e) { conversationInput = null }
  const sessionsSvc = pluginCtx.get('sessions')
  if (!conversationInput || !sessionsSvc) return
  if (currentId === undefined) return
  let binding
  try { binding = sessionsSvc.binding(currentId) } catch (e) { return }
  if (!binding || !binding.ctx) return
  let input
  try { input = conversationInput.for(binding.ctx) } catch (e) { return }
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

// ---- session row context-menu verbs (mirror the shipped ui-workspace) ----
// Fork: clone the session from its last completed turn and open the child.
function forkSession(sessionId) {
  const s = pluginCtx.get('sessions')
  if (!s || typeof s.fork !== 'function') return Promise.resolve()
  return s.fork({ sessionId, increaseTitle: true }).then((childId) => {
    if (s && typeof s.open === 'function') s.open(childId)
  }).catch(() => {})
}
// Archive: move the session into the registry-global archived set.
function archiveSession(sessionId) {
  const w = pluginCtx.get('workspaces')
  if (!w || typeof w.archiveSession !== 'function') return Promise.resolve()
  return w.archiveSession(sessionId).catch((reason) => {
    console.warn('session archive rejected:', reason)
  })
}

// Module-scope plugin context (set by apply) and the panel id set the shell
// validates persisted selections against.
let pluginCtx = null
const KNOWN_PANELS = ['sessions', 'explorer']

// ---- sidebar shell (reshadows the layout-owned `sidebar` slot) ----
// Shell lives in `sidebar.workspaces` (shadowing the stock workspace browser)
// instead of replacing the whole `sidebar` column. That keeps the stock chrome
// ui-sidebar renders around it — brand row, New Session, and crucially the
// foot area with `sidebar.footer.action` (the Cordis approval badge) and
// `sidebar.settings` — which a full `sidebar` shadow cannot re-declare
// without colliding with ui-sidebar's own declarations (slot already
// declared) and cannot render (renderSlot requires own children).
function SidebarShell(props) {
  const wide = !!props.wide
  const [activePanelId, setActivePanelId] = React.useState(() => {
    const saved = readJSON('dsh.sidebar.view.v1')
    const id = saved && typeof saved.activePanelId === 'string' ? saved.activePanelId : 'sessions'
    return KNOWN_PANELS.indexOf(id) !== -1 ? id : 'sessions'
  })
  const selectPanel = React.useCallback((id) => {
    setActivePanelId(id)
    writeJSON('dsh.sidebar.view.v1', { activePanelId: id })
    if (!wide && typeof props.expandSidebar === 'function') props.expandSidebar()
  }, [wide, props.expandSidebar])

  const strip = React.createElement('div', { className: 'dshsb-strip' },
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

// ---- sessions panel row context menu ----
function SessionsMenu({ menu, onClose }) {
  if (menu === null) return null
  const vw = typeof window !== 'undefined' ? window.innerWidth : 480
  const vh = typeof window !== 'undefined' ? window.innerHeight : 360
  const x = Math.max(4, Math.min(menu.x, vw - 190))
  const y = Math.max(4, Math.min(menu.y, vh - 128))
  const items = []
  if (menu.kind === 'group') {
    items.push(React.createElement('button', {
      key: 'copy-path',
      type: 'button',
      className: 'dshsb-menu-item',
      onClick: () => { copyText(menu.path); onClose() },
    }, '复制路径'))
  } else {
    items.push(React.createElement('button', {
      key: 'fork',
      type: 'button',
      className: 'dshsb-menu-item',
      onClick: () => { forkSession(menu.sessionId); onClose() },
    }, '分叉会话'))
    items.push(React.createElement('button', {
      key: 'archive',
      type: 'button',
      className: 'dshsb-menu-item',
      onClick: () => { archiveSession(menu.sessionId); onClose() },
    }, '归档会话'))
  }
  return React.createElement('div', {
    className: 'dshsb-menu',
    style: { left: x, top: y },
    onContextMenu: (e) => { e.preventDefault() },
  }, items)
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
      path: workspace.path,
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

  // Right-click context menu state (group → copy path; session → fork/archive).
  const [menu, setMenu] = React.useState(null)
  const openMenu = React.useCallback((m) => { setMenu(m) }, [])
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
        onContextMenu: (e) => {
          // The ungrouped bucket has no real folder path behind it.
          if (typeof group.path !== 'string' || group.path === '') return
          e.preventDefault()
          openMenu({ kind: 'group', path: group.path, x: e.clientX, y: e.clientY })
        },
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
            onContextMenu: (e) => {
              e.preventDefault()
              openMenu({ kind: 'session', sessionId: m.id, x: e.clientX, y: e.clientY })
            },
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
    React.createElement('div', { className: 'dshsb-tree' }, rows),
    React.createElement(SessionsMenu, { menu, onClose: closeMenu }))
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
  // Four items at ~30px each plus the menu's own padding.
  const x = Math.max(4, Math.min(menu.x, vw - 190))
  const y = Math.max(4, Math.min(menu.y, vh - 158))
  const abs = joinAbs(rootPath, menu.relPath)
  const copyAbs = () => { copyText(abs); onClose() }
  const copyRel = () => { copyText(menu.relPath); onClose() }
  const addToSession = () => { addPathToSession(abs, menu.kind, currentId); onClose() }
  const reveal = () => { revealInFileManager(abs); onClose() }
  return React.createElement('div', {
    className: 'dshsb-menu',
    style: { left: x, top: y },
    onContextMenu: (e) => { e.preventDefault() },
  },
    React.createElement('button', { type: 'button', className: 'dshsb-menu-item', onClick: reveal }, revealMenuLabel()),
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

  // Floating preview fallback: set when a previewable file was opened while
  // the conversation view ring is unavailable (blank new session). Rendered
  // as a portal overlay; see PreviewOverlay.
  const [overlayFile, setOverlayFile] = React.useState(null)

  const rootPath = React.useMemo(() => deriveRootPath(sessions), [sessions])

  // Relative keys would go stale across a session switch: drop the cache and
  // abort in-flight requests whenever the root cwd changes.
  const prevRoot = React.useRef(rootPath)
  React.useEffect(() => {
    if (prevRoot.current === rootPath) return
    const previous = prevRoot.current
    prevRoot.current = rootPath
    // The initial baseline transition (undefined -> path at first mount) is
    // NOT a session switch: aborting would kill the very first directory
    // fetch. Only a change between two defined roots invalidates.
    if (previous === undefined) return
    for (const controller of controllers.values()) controller.abort()
    controllers.clear()
    dispatch({ type: 'invalidate' })
  }, [rootPath, controllers])

  const load = React.useCallback((relDir) => {
    // Session snapshot not ready yet (page-load race): skip the call; when
    // sessions.current appears, this callback identity changes and the
    // mount effect re-fires.
    if (sessions.current === undefined) return
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
    const abs = joinAbs(rootPath, relPath)
    const kind = previewableOf(abs)
    if (kind !== null) {
      previewStore.openFile(abs, kind)
      // A blank new session renders no conversation chrome at all (no view
      // ring), so the 预览 tab cannot be activated there — open the same
      // preview in a floating overlay instead of failing with a misleading
      // "open a session first" hint.
      if (!activatePreviewView()) setOverlayFile(previewStore.get().file)
    } else {
      props.openPath(abs).catch(() => {})
    }
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
  if (!sessions || sessions.current === undefined) {
    // Session snapshot not ready yet (page-load race): hold the tree mount
    // until the session baseline appears, then DirectoryChildren mounts fresh
    // and fetches the root level.
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
    React.createElement(ExplorerMenu, { menu, rootPath, currentId: sessions.current, onClose: closeMenu }),
    overlayFile ? React.createElement(PreviewOverlay, { file: overlayFile, onClose: () => setOverlayFile(null) }) : null)
}

// ---- preview feature: session-area 预览 view (file preview + built-in browser) ----
// Ported from the runtime-preview dynamic plugin. The browser is NOT owned
// here anymore: dsh-builtin-browser is the shared browser core (store +
// controller + pick flow), bound in build.mjs as `builtinBrowser` closure
// symbols (browserStore / pageBrowserController / BLANK_PAGE / setOpenHandler
// / togglePicking / stopPicking). This file only renders the in-session 内置
//浏览器 view against that engine and switches the conversation view to it via
// setOpenHandler.

// --- preview store: the file open in the 预览 (file preview) view ---
let previewState = { file: null }
const previewListeners = new Set()
function previewEmit() {
  for (const l of previewListeners) { try { l() } catch (e) {} }
}
const previewStore = {
  get() { return previewState },
  subscribe(listener) { previewListeners.add(listener); return () => previewListeners.delete(listener) },
  openFile(path, kind) {
    const name = basenamePath(path) || path
    const ext = (name.split('.').pop() || '').toLowerCase()
    previewState = { file: { path, name, ext, kind } }
    previewEmit()
  },
}

// Switch the conversation view ring to one of our entries by simulating the
// header tab click (the active view lives in the chat store's internal `view`
// field, which has no public setter).
function activateViewByLabel(label) {
  try {
    const tabs = document.querySelectorAll('[role="tablist"] button[role="tab"]')
    for (const b of tabs) {
      if ((b.textContent || '').trim() === label) { b.click(); return true }
    }
  } catch (e) { /* ignore */ }
  return false
}
function activatePreviewView() { return activateViewByLabel('预览') }
function activateBrowserView() { return activateViewByLabel('内置浏览器') }


// --- markdown renderer (dependency-free mini renderer) ---
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
function inlineMd(s) {
  let out = escapeHtml(s)
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>')
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>')
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
  return out
}
function renderMarkdown(text) {
  const lines = String(text).split(/\r?\n/)
  const out = []
  let i = 0
  let inCode = false
  let codeBuf = []
  const flushCode = () => {
    if (codeBuf.length === 0) return
    out.push('<pre><code>' + codeBuf.join('\n') + '</code></pre>')
    codeBuf = []
  }
  while (i < lines.length) {
    const line = lines[i]
    if (!inCode && /^\s*```/.test(line)) { flushCode(); inCode = true; codeBuf = []; i++; continue }
    if (inCode && /^\s*```/.test(line)) { flushCode(); inCode = false; i++; continue }
    if (inCode) { codeBuf.push(line); i++; continue }
    if (line.trim().charAt(0) === '|') {
      const rows = []
      while (i < lines.length && lines[i].trim().charAt(0) === '|') { rows.push(lines[i]); i++ }
      if (rows.length >= 2) {
        const parseRow = (r) => r.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
        const head = parseRow(rows[0])
        const sep = parseRow(rows[1])
        const isSep = sep.length > 0 && sep.every((c) => /^:?-{3,}:?$/.test(c))
        let html = '<table><thead><tr>' + head.map((c) => '<th>' + inlineMd(c) + '</th>').join('') + '</tr></thead><tbody>'
        const start = isSep ? 2 : 1
        for (let r = start; r < rows.length; r++) {
          html += '<tr>' + parseRow(rows[r]).map((c) => '<td>' + inlineMd(c) + '</td>').join('') + '</tr>'
        }
        html += '</tbody></table>'
        out.push(html)
        continue
      }
    }
    const t = line.trim()
    if (t === '') { out.push('<p></p>'); i++; continue }
    if (/^#{1,6}\s/.test(t)) {
      const level = t.match(/^#+/)[0].length
      out.push('<h' + level + '>' + inlineMd(t.replace(/^#+\s*/, '')) + '</h' + level + '>')
    } else if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) {
      out.push('<hr>')
    } else if (/^>\s?/.test(t)) {
      out.push('<blockquote>' + inlineMd(t.replace(/^>\s?/, '')) + '</blockquote>')
    } else if (/^\s*[-*+]\s+/.test(line)) {
      out.push('<ul>')
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        out.push('<li>' + inlineMd(lines[i].replace(/^\s*[-*+]\s+/, '')) + '</li>')
        i++
      }
      out.push('</ul>')
      continue
    } else if (/^\s*\d+[.)]\s+/.test(line)) {
      out.push('<ol>')
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i].trim())) {
        out.push('<li>' + inlineMd(lines[i].trim().replace(/^\d+[.)]\s+/, '')) + '</li>')
        i++
      }
      out.push('</ol>')
      continue
    } else {
      out.push('<p>' + inlineMd(t) + '</p>')
    }
    i++
  }
  flushCode()
  return out.join('\n')
}

// --- components ---
function toUrl(input) {
  const trimmed = (input || '').trim()
  if (!trimmed) return BLANK_PAGE
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed
  return 'https://' + trimmed
}
function tabLabel(tab) {
  if (tab.title) return tab.title
  if (tab.current) {
    try { return new URL(tab.current).hostname } catch (e) { return tab.current }
  }
  return '新标签页'
}
function chromeUserAgent() {
  if (typeof navigator === 'undefined') return ''
  return navigator.userAgent.replace(/\s+Electron\/[\d.]+/, '')
}

function BrowserSurface() {
  const [state, setState] = React.useState(browserStore.get())
  const active = state.tabs.find((t) => t.id === state.activeTabId) || state.tabs[0]
  const [editing, setEditing] = React.useState(null)
  const [canGoBack, setCanGoBack] = React.useState(false)
  const [canGoForward, setCanGoForward] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  // Whether 标注 can reach the active tab's guest right now. Webview
  // (Electron shell) can always be annotated; an iframe only when the page is
  // same-origin (the browser forbids touching a cross-origin frame).
  const [annotatable, setAnnotatable] = React.useState(true)
  const inShell = Boolean(typeof window !== 'undefined' && window.desktopBridge)

  React.useEffect(() => browserStore.subscribe(() => {
    const next = browserStore.get()
    setState(next)
    setEditing((cur) => (cur && !next.tabs.some((t) => t.id === cur.id) ? null : cur))
  }), [])

  const refreshAnnotatable = React.useCallback(() => {
    const surf = browserStore.getSurface()
    if (!surf) { setAnnotatable(false); return }
    if (surf.executeJavaScript) { setAnnotatable(true); return }
    try {
      setAnnotatable(Boolean(surf.contentDocument))
    } catch (e) {
      // Cross-origin iframe: the parent cannot see its document.
      setAnnotatable(false)
    }
  }, [])

  React.useEffect(() => {
    refreshAnnotatable()
  }, [state.activeTabId, refreshAnnotatable])

  const refreshNavState = React.useCallback(() => {
    const wv = browserStore.getSurface()
    if (!wv) { setCanGoBack(false); setCanGoForward(false); return }
    try {
      setCanGoBack(wv.canGoBack ? wv.canGoBack() : false)
      setCanGoForward(wv.canGoForward ? wv.canGoForward() : false)
      const url = wv.getURL ? wv.getURL() : ''
      if (url && url !== BLANK_PAGE) browserStore.setCurrent(browserStore.get().activeTabId, url)
    } catch (e) { /* webview not attached yet */ }
  }, [])

  const bindSurface = (tabId) => (el) => {
    const wv = el
    browserStore.setSurface(tabId, wv)
    if (!wv) return
    if (!wv.__dshPreviewSrcSet) {
      wv.__dshPreviewSrcSet = true
      const pending = browserStore.takePendingCommand()
      let initial = ''
      const tab = browserStore.get().tabs.find((t) => t.id === tabId)
      if (pending && pending.op === 'navigate' && pending.url) initial = pending.url
      else if (tab) initial = tab.address
      wv.setAttribute('src', initial || BLANK_PAGE)
    }
    if (!inShell || wv.__dshPreviewBound) return
    wv.__dshPreviewBound = true
    const isActive = () => browserStore.get().activeTabId === tabId
    wv.addEventListener('did-navigate', () => { if (isActive()) { refreshNavState(); void stopPicking() } })
    wv.addEventListener('did-navigate-in-page', () => { if (isActive()) refreshNavState() })
    wv.addEventListener('did-finish-load', () => { if (isActive()) { setLoading(false); refreshNavState() } })
    wv.addEventListener('did-start-loading', () => { if (isActive()) setLoading(true) })
    wv.addEventListener('did-stop-loading', () => { if (isActive()) setLoading(false) })
    wv.addEventListener('page-title-updated', (event) => {
      const title = (event && event.title) || (wv.getTitle ? wv.getTitle() : '')
      browserStore.setTitle(tabId, title)
    })
  }

  React.useEffect(() => {
    refreshNavState()
    try {
      const surf = browserStore.getSurface()
      setLoading(surf && surf.isLoading ? surf.isLoading() : false)
    } catch (e) { setLoading(false) }
  }, [state.activeTabId, refreshNavState])

  // Leaving the browser view (or unmounting) aborts any armed pick.
  React.useEffect(() => () => { void stopPicking() }, [])

  const navigate = React.useCallback((input) => {
    const url = toUrl(input)
    const shown = url === BLANK_PAGE ? '' : url
    browserStore.setAddress(shown)
    const wv = browserStore.getSurface()
    if (!wv) {
      // View just activated; the surface binds on its next mount. Queue the
      // command so bindSurface loads this URL (shared core behavior).
      browserStore.setPendingCommand({ op: 'navigate', url })
      return
    }
    if (wv.loadURL) {
      setLoading(true)
      wv.loadURL(url).catch(() => setLoading(false))
    } else {
      wv.setAttribute('src', url)
      setLoading(true)
    }
  }, [])

  const commitEdit = React.useCallback((tabId, value) => {
    setEditing(null)
    const text = (value || '').trim()
    if (!text) return
    const tab = browserStore.get().tabs.find((t) => t.id === tabId)
    // 单击编辑模式下 blur 会频繁触发（切标签/点页面空白）；地址没变化就不
    // 重复导航，避免切换标签时把页面重新加载一遍。
    if (tab && tab.current && text === tab.current) return
    browserStore.activateTab(tabId)
    navigate(text)
  }, [navigate])

  const goBack = React.useCallback(() => { const s = browserStore.getSurface(); if (s && s.goBack) s.goBack() }, [])
  const goForward = React.useCallback(() => { const s = browserStore.getSurface(); if (s && s.goForward) s.goForward() }, [])
  const reload = React.useCallback(() => { const s = browserStore.getSurface(); if (s && s.reload) s.reload() }, [])
  const stop = React.useCallback(() => { const s = browserStore.getSurface(); if (s && s.stop) s.stop(); setLoading(false) }, [])

  const toolbarStyle = {
    display: 'flex', alignItems: 'center', gap: 4,
    padding: '5px 10px', borderBottom: '1px solid rgba(127,127,127,0.25)',
    background: 'var(--dsw-alias-bg-base)',
  }
  const tabsStyle = {
    display: 'flex', alignItems: 'center', gap: 4, flex: 1, minWidth: 0,
    overflowX: 'auto', padding: '1px 2px',
  }
  const surfaceStyle = { flex: 1, width: '100%', border: 'none', background: '#fff' }

  return React.createElement('div', { style: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: 'var(--dsw-alias-bg-base)', color: 'var(--dsw-alias-label-primary)' } },
    React.createElement('div', { style: toolbarStyle, role: 'toolbar', 'aria-label': '浏览器工具栏' },
      React.createElement('button', { type: 'button', className: 'dshbr-btn', onClick: goBack, disabled: !canGoBack, title: '后退', 'aria-label': '后退' },
        React.createElement(SvgIcon, { d: ICONS.back, size: 13.5 })),
      React.createElement('button', { type: 'button', className: 'dshbr-btn', onClick: goForward, disabled: !canGoForward, title: '前进', 'aria-label': '前进' },
        React.createElement(SvgIcon, { d: ICONS.forward, size: 13.5 })),
      React.createElement('button', { type: 'button', className: 'dshbr-btn', onClick: reload, title: '刷新', 'aria-label': '刷新' },
        React.createElement(SvgIcon, { d: ICONS.reload, size: 12 })),
      React.createElement('button', { type: 'button', className: 'dshbr-btn', onClick: stop, disabled: !loading, title: '停止', 'aria-label': '停止' },
        React.createElement(SvgIcon, { d: ICONS.stop, size: 13.5 })),
      React.createElement('div', { style: tabsStyle, role: 'tablist', 'aria-label': '标签页' },
        state.tabs.map((tab) => {
          const isEditing = editing && editing.id === tab.id
          return React.createElement('div', {
            key: tab.id,
            role: 'tab',
            'aria-selected': tab.id === active.id,
            tabIndex: 0,
            className: 'dshbr-tab' + (tab.id === active.id ? ' active' : '') + (isEditing ? ' editing' : ''),
            title: isEditing ? undefined : (tab.current || '新标签页，单击编辑地址'),
            // 单击即进入地址编辑（标签即地址栏）：切到该标签并打开编辑器，
            // 文本自动全选，直接输入即可替换。
            onClick: () => {
              browserStore.activateTab(tab.id)
              setEditing({ id: tab.id, value: tab.address || tab.current || '' })
            },
            onKeyDown: (e) => {
              if (e.key === 'Enter' || e.key === ' ') browserStore.activateTab(tab.id)
            },
          },
            isEditing
              ? React.createElement('input', {
                className: 'dshbr-tab-input',
                autoFocus: true,
                value: editing.value,
                onChange: (e) => setEditing({ id: tab.id, value: e.target.value }),
                onFocus: (e) => e.target.select(),
                onClick: (e) => e.stopPropagation(),
                onDoubleClick: (e) => e.stopPropagation(),
                onKeyDown: (e) => {
                  e.stopPropagation()
                  if (e.key === 'Enter') commitEdit(tab.id, editing.value)
                  else if (e.key === 'Escape') setEditing(null)
                },
                onBlur: () => commitEdit(tab.id, editing.value),
                placeholder: '输入网址后回车',
                'aria-label': '编辑标签页地址 ' + tabLabel(tab),
                spellCheck: false,
              })
              : React.createElement('span', { className: 'dshbr-tab-title' }, tabLabel(tab)),
            React.createElement('button', {
              type: 'button',
              className: 'dshbr-btn',
              onClick: (e) => { e.stopPropagation(); browserStore.closeTab(tab.id) },
              title: '关闭标签页',
              'aria-label': '关闭标签页 ' + tabLabel(tab),
            }, React.createElement(SvgIcon, { d: ICONS.x, size: 10 })),
          )
        }),
        React.createElement('button', {
          type: 'button',
          className: 'dshbr-btn',
          onClick: () => {
            const id = browserStore.addTab()
            setEditing({ id, value: '' })
          },
          title: '新建标签页',
          'aria-label': '新建标签页',
        }, React.createElement(SvgIcon, { d: ICONS.plus, size: 13.5 })),
      ),
      React.createElement('button', {
        type: 'button',
        className: 'dshbr-btn' + (state.picking ? ' dshbr-btn-picking' : ''),
        style: state.picking ? { opacity: 1 } : undefined,
        // Always clickable: an unclickable toolbar button reads as broken.
        // When the page cannot be annotated (cross-origin iframe), the shared
        // core's startPicking shows the reason as a toast instead.
        onClick: () => togglePicking(),
        title: !annotatable
          ? '当前页面为跨域 iframe，浏览器禁止标注；请使用 dsh-desktop 桌面端，或导航到同源页面'
          : (state.picking ? '结束标注' : '标注页面元素（拾取发给助手）'),
        'aria-label': state.picking ? '结束标注' : '标注页面元素',
        'aria-pressed': state.picking,
      }, React.createElement(SvgIcon, { d: ICONS.crosshair, size: 13.5 })),
    ),
  state.toast
    ? React.createElement('div', {
      role: 'alert',
      className: state.toast.ok ? 'dshbr-toast dshbr-toast-ok' : 'dshbr-toast',
    }, state.toast.text)
    : null,
  state.tabs.map((tab) => {
      const hidden = tab.id === active.id ? {} : { display: 'none' }
      const bindRef = (el) => { bindSurface(tab.id)(el) }
      return inShell
        ? React.createElement('webview', {
          key: tab.id,
          ref: bindRef,
          style: Object.assign({}, surfaceStyle, hidden),
          allowpopups: true,
          useragent: chromeUserAgent(),
          partition: 'persist:dsh-browser',
        })
        : React.createElement('iframe', {
          key: tab.id,
          ref: bindRef,
          style: Object.assign({}, surfaceStyle, hidden),
          onLoad: () => {
            if (browserStore.get().activeTabId !== tab.id) return
            setLoading(false)
            browserStore.setCurrent(tab.id, tab.address)
            // A real navigation replaced the guest document: any injected
            // editor is gone, so leave picking mode; the new page may also be
            // cross-origin (iframe), which 标注 cannot reach.
            if (browserStore.get().picking) void stopPicking()
            refreshAnnotatable()
          },
          title: '内置浏览器',
          sandbox: 'allow-same-origin allow-scripts allow-forms allow-popups allow-downloads',
        })
    }),
  )
}

const MD_EXT = { md: 1, markdown: 1, mdx: 1 }
function FilePreviewSurface({ file }) {
  const path = file ? file.path : null
  const [res, setRes] = React.useState(null)

  React.useEffect(() => {
    if (!path) { setRes(null); return }
    let alive = true
    setRes({ loading: true, error: null, data: null })
    rpcCall('read-file', { path }).then((r) => {
      if (!alive) return
      if (r && r.ok === true) setRes({ loading: false, error: null, data: r })
      else setRes({ loading: false, error: (r && r.error) || '读取失败', data: null })
    }, (err) => {
      if (alive) setRes({ loading: false, error: errorText(err), data: null })
    })
    return () => { alive = false }
  }, [path])

  if (!path) {
    return React.createElement('div', { className: 'dshpv-empty' },
      React.createElement('div', null, '还没有打开文件'),
      React.createElement('div', { className: 'dshpv-emptyhint' }, '在左侧资源管理器中双击文件，即可在此预览'))
  }
  if (res && res.error) {
    return React.createElement('div', { className: 'dshpv-status' },
      React.createElement('span', { className: 'dshpv-error', role: 'alert' }, res.error))
  }
  if (!res || res.loading || !res.data) {
    return React.createElement('div', { className: 'dshpv-status' }, '正在读取文件…')
  }
  const data = res.data
  if (data.kind === 'image') {
    return React.createElement('div', { className: 'dshpv-imgwrap' },
      React.createElement('img', { src: 'data:' + data.mime + ';base64,' + data.data, alt: file.name, className: 'dshpv-img' }))
  }
  const ext = String(data.ext || '').toLowerCase()
  const isMd = MD_EXT[ext] === 1
  return React.createElement('div', { className: 'dshpv-textwrap' },
    isMd
      ? React.createElement('div', { className: 'dshpv-md', dangerouslySetInnerHTML: { __html: renderMarkdown(data.text) } })
      : React.createElement('pre', { className: 'dshpv-pre' }, data.text))
}

// 预览 view = file preview only (the browser is its own sibling view in the
// conversation view ring). A slim header shows the open file's name.
function PreviewView() {
  const [pstate, setPstate] = React.useState(previewStore.get())
  React.useEffect(() => previewStore.subscribe(() => setPstate(previewStore.get())), [])
  const file = pstate.file
  const header = file
    ? React.createElement('div', { className: 'dshpv-modetabs' },
      React.createElement('span', { className: 'dshpv-filehead' }, file.name))
    : null
  return React.createElement('div', { className: 'dshpv-root' },
    header,
    React.createElement(FilePreviewSurface, { file }))
}

// Floating fallback preview: a brand-new session is blank until its first
// message, and while blank the harness renders no conversation chrome at all —
// no header, no view ring, so the 预览 tab cannot be activated (previously we
// surfaced the misleading hint "预览需要先打开一个会话" even though a session
// IS open). When activation fails, show the same file preview in a modal
// overlay instead, portaled to <body> so no ancestor transform can clip it.
// `ReactDOM` is a closure symbol provided by the build wrapper
// (require('react-dom'), same as `React`).
function PreviewOverlay({ file, onClose }) {
  React.useEffect(() => {
    if (typeof document === 'undefined') return
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  const panel = React.createElement('div', {
    className: 'dshpv-overlay',
    onMouseDown: (e) => { if (e.target === e.currentTarget) onClose() },
  },
    React.createElement('div', { className: 'dshpv-overlaybox', role: 'dialog', 'aria-modal': 'true', 'aria-label': '文件预览' },
      React.createElement('div', { className: 'dshpv-overlayhead' },
        React.createElement('span', { className: 'dshpv-overlaytitle' }, file ? file.name : '预览'),
        React.createElement('span', { className: 'dshpv-overlaynote' }, '新会话尚无对话内容，预览以浮窗打开；发送消息后可在会话内「预览」视图查看'),
        React.createElement('button', {
          type: 'button',
          className: 'dshpv-overlayclose',
          onClick: onClose,
          autoFocus: true,
          'aria-label': '关闭预览',
        }, React.createElement(SvgIcon, { d: ICONS.x, size: 14 }))),
      React.createElement(FilePreviewSurface, { file })))
  if (typeof ReactDOM !== 'undefined' && ReactDOM && typeof ReactDOM.createPortal === 'function' && typeof document !== 'undefined') {
    return ReactDOM.createPortal(panel, document.body)
  }
  return panel
}

// 内置浏览器 view: wraps BrowserSurface in the shared .dshpv-root chrome so
// the composer-hiding rule applies while the browser is the active view.
function BrowserView() {
  return React.createElement('div', { className: 'dshpv-root' },
    React.createElement(BrowserSurface))
}

// ---- plugin apply ----
async function apply(ctx) {
  pluginCtx = ctx
  const slots = ctx.get('slots')
  if (slots === undefined) return
  const disposeCss = insertCss(CSS)

  // Resolve the shared browser core (dsh-builtin-browser/client) through the
  // async module import: it arrives the core's bundle row (registers its
  // factory) before resolving, so this is race-free even though client entries
  // boot in parallel. Bind the module-level identifiers the views and the
  // click handler reference; React renders after apply resolves.
  const core = await ctx.modules.import('dsh-builtin-browser/client')
  browserStore = core.browserStore
  pageBrowserController = core.pageBrowserController
  BLANK_PAGE = core.BLANK_PAGE
  setOpenHandler = core.setOpenHandler
  togglePicking = core.togglePicking
  stopPicking = core.stopPicking

  // The browser controller (window.__dshBrowser) and the 标注 pick flow are
  // owned by the shared core (dsh-builtin-browser), which mounts them in its
  // own apply — nothing to install or override here. This view only teaches
  // the core what "open the browser" means in this composition: switch the
  // conversation view ring to the in-session 内置浏览器 view.
  setOpenHandler(() => activateBrowserView())
  ctx.effect(() => () => setOpenHandler(null))

  // Clicking an http(s) link anywhere in the harness GUI opens it in the
  // in-session 内置浏览器 view. Chat markdown renders URLs with
  // target="_blank", so the click would become window.open — the Desktop
  // shell denies loopback URLs outright (preview links appear dead) and sends
  // the rest to the system browser. Modifier-click keeps the default action.
  const onDocLinkClick = (event) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    const target = event.target
    if (!(target instanceof Element)) return
    const anchor = target.closest('a[href]')
    if (!anchor) return
    const href = anchor.getAttribute('href') || ''
    if (!/^https?:\/\//i.test(href)) return
    // Never hijack links inside a dialog (e.g. the plugin's own UI).
    const dialog = anchor.closest('[role="dialog"]')
    if (dialog && dialog.getAttribute('aria-label') === '内置浏览器') return
    event.preventDefault()
    event.stopPropagation()
    void pageBrowserController.command({ op: 'navigate', url: href })
  }
  document.addEventListener('click', onDocLinkClick, true)
  ctx.effect(() => () => document.removeEventListener('click', onDocLinkClick, true))

  // (Closing the browser aborts an armed pick — the shared core's pick flow
  // subscribes to its own store for that; nothing to wire here.)

  // One level of the current session's cwd via the host fileReferences Remote.
  // relDir '' = root; any other value is a relative directory path.
  const listDirectory = (sessionId, relDir, signal) => {
    // Read the Remote sub-service by its FULL key: traversing
    // ctx.get('remote').fileReferences would walk the cordis service proxy
    // and hit the inject guard (mirrors the TS plugin's approach).
    const fileReferences = ctx.get('remote.fileReferences')
    if (!fileReferences || typeof fileReferences.list !== 'function') {
      return Promise.reject(new Error('文件引用服务不可用'))
    }
    const query = relDir === '' ? '' : relDir + '/'
    return fileReferences.list(sessionId, query, signal).then((result) => {
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
      name: 'sidebar.workspaces',
      priority: -1,
      children: {
        'sidebar.activity': { kind: 'list', scope: 'root' },
        'sidebar.panel': { kind: 'list', scope: 'root' },
      },
    }, SidebarShell))
    disposers.push(slots.register({ name: 'sidebar.activity', id: 'sessions', order: 1, priority: -1, inject: () => ({ panelId: 'sessions' }) }, ActivityIcon))
    disposers.push(slots.register({ name: 'sidebar.activity', id: 'explorer', order: 2, priority: -1, inject: () => ({ panelId: 'explorer' }) }, ActivityIcon))
    disposers.push(slots.register({ name: 'sidebar.panel', id: 'sessions', order: 1, priority: -1, inject: () => ({ panelId: 'sessions' }) }, SessionsPanel))
    disposers.push(slots.register({ name: 'sidebar.panel', id: 'explorer', order: 2, priority: -1, inject: () => ({ panelId: 'explorer', listDirectory, openPath }) }, ExplorerPanel))
    // Session-area views (conversation.view ring) — waits for the slot the
    // ui-conversation bundle declares, so registration order does not matter.
    // 预览 = file preview; 内置浏览器 = its own sibling view, same level.
    disposers.push(slots.inject('conversation.view', () => slots.register({
      name: 'conversation.view',
      id: 'preview',
      order: 20,
      label: () => '预览',
    }, PreviewView)))
    disposers.push(slots.inject('conversation.view', () => slots.register({
      name: 'conversation.view',
      id: 'browser',
      order: 30,
      label: () => '内置浏览器',
    }, BrowserView)))
    // Composition choice: in THIS profile the browser is the in-session view,
    // so dsh-builtin-browser's own floating panel + sidebar toggle are kept
    // from surfacing. The engine is shared (builtinBrowser closure symbols);
    // only its standalone UI is shadowed — same-id empty entries replace them
    // (client bundle config is not delivered to the client, so this is the
    // reliable switch). Compositions that want the floating panel instead can
    // simply not load this package.
    disposers.push(slots.inject('shell.overlay', () => slots.register({
      name: 'shell.overlay',
      id: 'builtin-browser',
      order: 10,
      priority: -1,
    }, () => null)))
    disposers.push(slots.inject('sidebar.footer.action', () => slots.register({
      name: 'sidebar.footer.action',
      id: 'builtin-browser',
      order: 10,
      priority: -1,
    }, () => null)))
    return () => {
      for (const d of disposers) {
        try { if (typeof d === 'function') d() } catch (e) { /* noop */ }
      }
    }
  })
}
