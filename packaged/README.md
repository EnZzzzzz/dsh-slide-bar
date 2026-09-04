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

- `src/index.js` — Host 半边：空 apply（纯 UI 插件占位）+ `/preview-fs` RPC（资源管理器/预览视图读目录与文件）。
- `src/client/index.js` — Client 半边：重绘 `sidebar`（priority −1）+ 活动栏 + 会话工作区树 + 资源管理器（右键菜单：复制路径/复制相对路径/添加到会话 → 原生 `@file` chip）+ 全局「预览 / 内置浏览器」浮层视图。**浏览器本体不再是本包的一部分**：内置浏览器引擎（store / 控制器 / 标注流程）由 `dsh-builtin-browser` 提供，本包只渲染浮层视图并通过 `ctx.modules.import('dsh-builtin-browser/client')` 异步取用共享核心（详见下方「与 dsh-builtin-browser 的关系」）。

> **会话面板恢复为继承版**：本包的轻量会话面板注册为 priority −1，`dsh-slide-bar`（TS 包）的**继承原版 ui-workspace 会话面板**注册为 −2（低者胜出）并影子掉它，因此「会话」面板呈现原版完整功能（搜索 / 分组 / 拖拽 / 重命名 / 分叉 / 归档 / 文件夹复制路径）；本包的轻量会话面板成为不活跃的影子条目，仅在本包单独安装时可见。TS 包已移除 explorer 注册，资源管理器仍由本包独占。
- `build.mjs` — 无工具链构建：把 client 源码包进 `window.__ModuleLoader__.load({id, factory})` 闭包工厂（`React` 由 `require('react')` 解析，浏览器核心**不在 factory 顶层 require**——client 条目并行启动，同步 require 会竞态；改由 `apply()` 里 `ctx.modules.import()` 异步解析，再把模块级绑定赋给视图），产出 `lib/client.js`；`lib/index.js` 为 ESM host。
- `vendor/selector/` — 保留的 vendored [oil-oil/selector](https://github.com/oil-oil/selector)（MIT）快照（**不再打进 bundle**，标注编辑器随核心包走）。
- `smoke.mjs` — 冒烟测试：加载闭包工厂、调用 `apply`（无 slots 早退 + 全量注册 9 个槽位），stub 掉 `ctx.modules.import` 的核心。
- `cordis.patch.yml` — bundle 层：把本包插入 web-app client roster。

## 与 dsh-builtin-browser 的关系（职责划分）

- **dsh-builtin-browser = 浏览器核心包**：一份 store（`browserStore`，含 pending 命令）、一份页面控制器（`pageBrowserController`，挂载 `window.__dshBrowser`）、一份标注流程（`setupPickFlow`/`togglePicking`/`stopPicking`，webview + iframe 双通道），以及它自带的独立悬浮面板 UI。
- **dsh-sidebar-live = 视图 + 组合开关**：本包通过 `ctx.modules.import('dsh-builtin-browser/client')` 复用同一套引擎，只实现自己的全局「内置浏览器」浮层视图（`BrowserView`），并通过 `setOpenHandler(() => globalViewStore.open('browser'))` 告诉核心「打开浏览器 = 打开全局浮层视图」；本包不再 fork store/控制器/标注，也不再覆盖 `window.__dshBrowser`。
- 悬浮面板 vs 会话区视图二选一：本包在 `shell.overlay` / `sidebar.footer.action` 注册同名空条目（同 id 替换）压制 builtin-browser 的悬浮面板与侧边栏按钮——client 端拿不到组合 config，这是可靠的组合级开关；想要悬浮面板的组合不装本包即可。
- 依赖顺序：manifest 中 `dsh-builtin-browser` 须先于本包加载（profile bundles 顺序已保证）；本包 `apply()` 的异步 import 自带 graph-row 到达，即使并行启动也不会竞态。

## 内置浏览器的「标注」与全局浮层视图

「预览」「内置浏览器」**不在会话头部的视图环里**（会话 tab 只有 对话 / 轨迹），而是全局浮层：界面右上角有一组切换按钮（眼睛 = 预览、地球 = 内置浏览器），任何界面状态下都能点开——包括还没有任何对话内容的全新会话（blank 态下会话头部根本不渲染，会话内 tab 在那里机制上不存在）。浮层挂在 root scope 的 `shell.overlay` 槽位（`GlobalViewsOverlay`），Esc / 点击遮罩 / 再次点击按钮关闭。

- **预览** = 纯文件预览（`PreviewView` → `FilePreviewSurface`），数据在模块级 `previewStore`。
- **内置浏览器** = 独立的同级浮层视图（`BrowserView` → `BrowserSurface`），agent 调 `browser_*` 工具时自动弹出。
- **对话/页面里的 `http(s)` 链接，单击即在此视图打开**：本包在 document 上挂了一个 capture 阶段 click 拦截（`onDocLinkClick`），左键单击（无修饰键）命中绝对 `http(s)` 链接时 `preventDefault` 并调用**共享核心**的浏览器控制器 `navigate`（核心经 `setOpenHandler` 回调打开浮层），自动弹出「内置浏览器」并加载该地址。原因：对话 markdown 渲染的链接带 `target="_blank"`，单击会走 `window.open`，而 Desktop 外壳对 `127.0.0.1` 回环地址直接拒绝（预览链接点击无反应）、其余地址丢给系统浏览器。按住 ⌘/Ctrl 等修饰键则保留默认行为。

内置浏览器工具栏最右侧有一个 **⌖ 标注** 按钮（拾取页面元素、加注释、一键「发送到会话」生成 Design Feedback markdown，由 vendored Selector 编辑器实现）：

- **Electron 外壳内**（`window.desktopBridge` 存在，渲染 `<webview>`）：通过 `webview.executeJavaScript` 把编辑器注入 guest 页，跨域站点也能标注。
- **普通浏览器**（渲染 `<iframe>`）：同源页面（含 about:blank / 本地页面）通过 `<script>` 元素注入；跨域页面不可标注，点击会显示红色提示。

编辑器内点「发送到会话」后，生成的 markdown 会以排队 prompt 发进当前会话，标注自动结束。

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
- profile 里原有的 `dsh-slide-bar`（原 TS 包）保持安装；它只注册 `sessions` 面板（priority −2），被本包（−1）声明槽位后接管会话面板，不产生冲突；如不需要可自行从 profile 移除。
- **会话面板由 `dsh-slide-bar` 继承版接管**：TS 包的 sessions 注册为 priority −2（低者胜出），影子掉本包的轻量会话面板（−1），呈现完整原版功能（搜索 / 分组 / 拖拽 / 重命名 / 分叉 / 归档 / 文件夹复制路径）。TS 包的 explorer 注册已移除——它的 explorer（order 10）曾与资源管理器抢占 `sidebar.panel` 槽位且无预览拦截，导致双击文件直接走系统打开，因此资源管理器现由本包独占。
- 树根仅支持当前会话 cwd；无当前会话时显示空态提示。
- 目录数据经 `fileReferences.list` 有 `maxResults` 上界，超出会截断并显示「仅显示部分内容」。
