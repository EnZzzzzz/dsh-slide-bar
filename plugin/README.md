# dsh-slide-bar

dsh Web UI 插件：VSCode 式左侧边栏的「会话」面板（**继承 dsh 原版会话管理面板**）。它向侧边栏外壳（`sidebar.activity` + `sidebar.panel` 槽位）注册一条条目：聊天图标 + 原版会话面板（id `sessions`）。目标槽位由外壳（本仓库 `packaged/` 的 `dsh-sidebar-live` bundle 声明的活动栏外壳）的 apply 声明，因此本插件通过 `slots.inject()` 跟随每次声明生命周期注册，重声明后自动重注册。

> 资源管理器文件树面板不在本包中：它由 `packaged/`（`dsh-sidebar-live`）独占注册（带文件预览 + 内置浏览器），本包只负责把**原版完整会话面板**带回来。

## 功能

- **继承原版会话面板（fork 自 `@deepseek-ai/dsh-client-ui-workspace`）**：搜索、工作区分组 / 单列视图、拖拽排序、工作区 / 会话重命名、右键菜单（分叉会话 / 归档会话 / 重命名 / 删除工作区），并在工作区（文件夹）右键菜单上扩展了「**复制路径**」（复制该文件夹的绝对路径）。会话面板按工作区分组展示，未分组会话归入「未分组」。
- **注册优先级 −2**：dsh-sidebar-live 的轻量会话面板（priority −1）被本面板（−2，低者胜出）影子掉，呈现完整原版功能。
- **双语界面**：中文 / 英文词典（`sidebar.sessions` 命名空间）。

## 继承原版会话面板（src/client/workspace/）

`src/client/workspace/` 是 `@deepseek-ai/dsh-client-ui-workspace` 的 MIT 源码 fork（`WorkspaceBrowser.tsx`、`tree.ts`、`stores.ts`、`locales.ts`、`WorkspacePicker.tsx`、`rows/Rows.tsx` 及三个 CSS Module），文件头均注明来源。改动点：

1. **注册目标改为 `sidebar.panel`（id `sessions`）**：原版注册进 `sidebar.workspaces` 单槽位；本插件经 `SessionsPanelHost` 适配外壳的 `sidebar.panel` list 槽位（owner 含 `activePanelId`），按 `activePanelId === 'sessions'` 自门控。所有原版功能（搜索 / 分组 / 拖拽 / 重命名 / 分叉 / 归档）原样保留。
2. **目录流槽位改名**：`sidebar.workspaces.directoryFlow` → `sidebar.panel.sessions.directoryFlow`（原 key 已被内置 ui-workspace 声明，声明即占有，不能重声明）。
3. **词典命名空间**：`workspace` → `sidebar.sessions`（内置 ui-workspace 已注册 `workspace` zh/en，locale 服务拒绝重复 (ns, locale)，fork 必须用自己的命名空间）。
4. **工作区行右键菜单新增「复制路径」**（`menu.copyPath` + `copyPath` action → `writeClipboard(group.cwd)`）。

> 本包不再注册资源管理器（`ExplorerPanel` / `ExplorerActivityIcon`）：早期版本同时注册 explorer（order 10）时与 `packaged/` 的资源管理器抢占 `sidebar.panel` 槽位且无预览拦截，曾导致双击文件直接走系统打开。恢复原版会话面板的正确姿势是「移除本包 explorer 注册 + 重新加入本包」，即当前状态。

## 安装

本包是独立的外部 dsh bundle（`dsh.bundle.patch` 指向 `cordis.patch.yml`，其中 `- insert:` 行把插件插入 web-app 的 client roster）。

先构建产物，再装进 web profile（**与 `packaged/` 的 `dsh-sidebar-live` 并存**）：

```sh
pnpm install
pnpm run bundle

# 在 dsh 仓库中（或任何已安装 dsh CLI 的环境）执行：
cd /path/to/deepseek-harness
pnpm dsh plugin --profile web add link:/path/to/dsh-slide-bar/plugin
```

`dsh plugin add` 会把本包以 `link:` 依赖写入 `$DSH_HOME/profiles/web/package.json`，并因为包声明了 `dsh.bundle` 而把 `dsh-slide-bar` 追加到 profile 的 `dsh.profile.bundles` 列表 —— 下次启动 `dsh web` 时 cordis.patch.yml 层自动生效。

手工方式（不用 CLI）：在 `$DSH_HOME/profiles/web/package.json` 的 `dependencies` 里加 `"dsh-slide-bar": "link:/path/to/dsh-slide-bar/plugin"`，在 `dsh.profile.bundles` 数组末尾追加 `"dsh-slide-bar"`。

## 开发

```sh
pnpm install          # 链接 dsh 仓库的接口包（link: devDependencies）并安装工具链
pnpm run bundle       # tsc 产出 lib/types，tsdown 产出 lib/index.js、lib/invariant.js、lib/client.js
pnpm vitest run       # 单元测试（jsdom 由各 spec 首行 pragma 指定）
pnpm run typecheck    # 仅类型检查
```

注意：

- 依赖的 `@deepseek-ai/*` 包通过 `link:` 指向 dsh 仓库工作树；类型解析走各包已构建的 `lib/types`（需要 dsh 仓库先 `pnpm run build` 过），vitest 则通过 alias 直接解析到各包 `src`。
- 改完源码要重新 `pnpm run bundle` 再刷新浏览器 —— dsh 的 modules 服务伺服的是 `lib/client.js`，不是源码。
- 构建产物 `lib/client.js` 是 closure-factory 格式（`window.__ModuleLoader__.load({id, factory})`），react、cordis、ui-slots、ui-primitives 等平台模块由 dsh 的模块表注入，其余依赖（如 clsx）全部内联。

## 面板行为

面板根据外壳的 `activePanelId` owner prop 自门控：其他面板激活时渲染 null。注册优先级 −2 影子掉 dsh-sidebar-live 的轻量会话面板（−1），所以「会话」图标点开后呈现的是原版完整面板（搜索 / 分组 / 拖拽 / 重命名 / 分叉 / 归档 / 文件夹复制路径）。

## 已知限制

- 依赖外壳（`packaged/` 的 dsh-sidebar-live）声明 `sidebar.activity` / `sidebar.panel` 槽位；单独安装本包（无外壳）时没有注册入口，面板不会出现。
- 目录流槽位（`sidebar.panel.sessions.directoryFlow`）当前没有占用者，因此「添加工作区…」入口不出现（与原版 ui-workspace 无 picker 包时的行为一致）。
