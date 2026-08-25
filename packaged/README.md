# dsh-sidebar-live — 正式安装包（持久化，重启后自动生效）

把 `runtime-plugin/`（动态插件）包装成**正式安装的 dsh 插件包**：通过 profile bundle 机制装进 web profile，重启 dsh 后自动加载，不再依赖会话内的 `cordis_define`/`cordis_run`。

## 与动态插件（runtime-plugin）的差异

动态插件依赖动态 runner 提供的 `host.call` / `styles` 闭包，且进程级不持久；正式包没有这些闭包，因此：

| 项 | 动态插件 | 本包 |
| --- | --- | --- |
| 目录数据 | Host `fs.listDir`（绝对路径） | `ctx.remote.fileReferences.list(会话, 相对目录, signal)`——按**当前会话 cwd** 逐层列举，返回相对路径 + kind；这正是 rc08 内置 @file 功能的数据源 |
| 样式 | `styles.insert(CSS)` | 手动 `<style data-plugin>` 注入（`insertCss`） |
| React | runner 闭包 `React` | 闭包工厂内 `require('react')`（loader 模块表） |
| 持久化 | 无 | **写入 web profile，重启后仍在** |
| 隐藏文件开关 | 有 | **移除**（fileReferences 列举天然跳过 dotfiles） |
| 树根 | 会话 cwd 或最近工作区 | 仅当前会话 cwd（fileReferences 以会话 cwd 为界，无会话时显示空态） |

## 结构

- `src/index.js` — Host 半边：空 apply（纯 UI 插件占位）。
- `src/client/index.js` — Client 半边：重绘 `sidebar`（priority −1）+ 活动栏 + 会话工作区树 + 资源管理器（右键菜单：复制路径/复制相对路径/添加到会话 → 原生 `@file` chip）。会话面板同样带右键菜单：工作区行「复制路径」，会话行「分叉会话 / 归档会话」（与原版 ui-workspace 同一套 `sessions.fork` / `workspaces.archiveSession` 服务）。
- `build.mjs` — 无工具链构建：把 client 源码包进 `window.__ModuleLoader__.load({id, factory})` 闭包工厂（`React` 由 `require('react')` 解析），产出 `lib/client.js`；`lib/index.js` 为 ESM 空 host。构建时还会把 `vendor/selector/` 里 vendored 的 Selector 编辑器（标注功能）读入 `editorBundle` / `editorCss` 两个字符串常量打进 bundle。
- `vendor/selector/` — vendored [oil-oil/selector](https://github.com/oil-oil/selector)（MIT）标注编辑器快照：`editor.bundle.js` + `editor.css` + LICENSE/NOTICE。**不要手改**：从 dsh-builtin-browser 同目录同步。
- `smoke.mjs` — 冒烟测试：加载闭包工厂、调用 `apply`（无 slots 早退 + 全量注册 5 个槽位）。
- `cordis.patch.yml` — bundle 层：把本包插入 web-app client roster。

## 内置浏览器的「标注」与预览态布局

会话头部的视图环现在有四个 tab：**对话 / 轨迹 / 预览 / 内置浏览器**。

- **预览** = 纯文件预览（`PreviewView` → `FilePreviewSurface`）。
- **内置浏览器** = 独立的同级视图（`BrowserView` → `BrowserSurface`），agent 调 `browser_*` 工具时自动切过来。

内置浏览器工具栏最右侧有一个 **⌖ 标注** 按钮（拾取页面元素、加注释、一键「发送到会话」生成 Design Feedback markdown，由 vendored Selector 编辑器实现）：

- **Electron 外壳内**（`window.desktopBridge` 存在，渲染 `<webview>`）：通过 `webview.executeJavaScript` 把编辑器注入 guest 页，跨域站点也能标注。
- **普通浏览器**（渲染 `<iframe>`）：同源页面（含 about:blank / 本地页面）通过 `<script>` 元素注入；跨域页面不可标注，点击会显示红色提示。

编辑器内点「发送到会话」后，生成的 markdown 会以排队 prompt 发进当前会话，标注自动结束。

另外，当 预览 或 内置浏览器 视图激活时（`.dshpv-root` 出现在会话滚动区内），底部输入框（composer）自动隐藏，把整块空间让给浏览器/文件预览；切回「对话」视图即恢复。该规则依赖会话外壳的稳定属性选择器：

```css
[data-conversation-scroll]:has(.dshpv-root) > [data-composer-seat] { display: none; }
```

> 注：`lib/client.js` 在 `.gitignore` 中，构建产物不入库；修改源码后重新 `node build.mjs` 即可（web 服务器按请求从磁盘读 bundle，刷新页面即生效）。

## 构建与安装

```sh
cd packaged
node build.mjs          # 产出 lib/index.js + lib/client.js
node smoke.mjs          # 冒烟测试

# 安装到 web profile（= dsh plugin add link: 的等价手工步骤）
# 1. ~/.dsh/profiles/web/package.json：
#    dependencies 加  "dsh-sidebar-live": "link:/…/dsh-slide-bar/packaged"
#    dsh.profile.bundles 追加 "dsh-sidebar-live"
# 2. 建立软链（nodeLinker: hoisted）：
#    ln -sfn ../../../../../../Volumes/DataDrive/proj/my/dsh-slide-bar/packaged \
#            ~/.dsh/profiles/web/node_modules/dsh-sidebar-live
# 3. 重启 dsh —— 之后每次启动自动加载
```

## 注意

- **重启后生效**：web-app 在启动时扫描 profile bundles；本次会话里的动态插件 `slide-1` 会在重启后消失（进程级），由本包接管侧边栏。
- profile 里原有的 `dsh-slide-bar`（原 TS 包）保持安装；它的 `slots.inject('sidebar.activity'/'sidebar.panel')` 会在本包声明槽位后注册同 id 的 explorer（priority 0），被本包（priority −1）影子掉，不产生冲突；如不需要可自行从 profile 移除。
- **已从 profile 移除 `dsh-slide-bar`（TS 包）**：它的 explorer（order 10）与资源管理器抢占 `sidebar.panel` 槽位且无预览拦截，曾导致双击文件直接走系统打开。侧边栏面板现由本包独占（会话轻量面板 + 预览版资源管理器）。如要恢复原版完整会话面板，需先移除 TS 包里的 explorer 注册再重新加入。
- 树根仅支持当前会话 cwd；无当前会话时显示空态提示。
- 目录数据经 `fileReferences.list` 有 `maxResults` 上界，超出会截断并显示「仅显示部分内容」。
