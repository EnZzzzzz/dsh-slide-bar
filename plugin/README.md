# dsh-slide-bar

dsh Web UI 插件：VSCode 式左侧边栏「资源管理器」文件树面板。它向 dsh 的侧边栏外壳（`@deepseek-ai/dsh-client-ui-sidebar` 提供的 `sidebar.activity` + `sidebar.panel` 槽位）注册两个条目：活动栏上的一个文件夹图标（面板 id `explorer`）和自门控的文件树面板。两个目标槽位都由 ui-sidebar 的 apply 声明，因此本插件通过 `slots.inject()` 跟随每次声明生命周期注册，重声明后自动重注册。

## 功能

- **文件树浏览**：以当前会话记录的工作目录（`cwd`）为根，无会话时回退到最近工作区的路径；两者都没有时显示空状态提示。
- **按需加载**：每展开一个目录才调用一次 `ctx.workspaces.listDirectory(path, { includeFiles: true })`，只拉取该层；每个路径最多一个在途请求，被取代/折叠/刷新/卸载时通过 `AbortController` 取消。
- **持久化视图状态**：展开状态、单层列表缓存、截断标记、隐藏文件开关保存在 localStorage（`dsh.explorer.view.v1`），重载后恢复；失败的层显示内联「重试」，不会在每次渲染时自动重试。
- **只读操作**：文件行点击调用 `ctx.workspaces.openPath` 用系统默认程序打开；不提供新建/重命名/删除等写操作。
- **双语界面**：中文 / 英文词典（`explorer` 命名空间）。

## 安装

本包是独立的外部 dsh bundle（`dsh.bundle.patch` 指向 `cordis.patch.yml`，其中 `- insert:` 行把插件插入 web-app 的 client roster）。

先构建产物，再用 dsh CLI 装进 web profile：

```sh
pnpm install
pnpm run bundle

# 在 dsh 仓库中（或任何已安装 dsh CLI 的环境）执行：
cd /path/to/deepseek-harness
pnpm dsh plugin --profile web add link:/path/to/dsh-slide-bar/plugin
```

`dsh plugin add` 会把本包以 `link:` 依赖写入 `$DSH_HOME/profiles/web/package.json`，并因为包声明了 `dsh.bundle` 而把 `dsh-slide-bar` 追加到 profile 的 `dsh.profile.bundles` 列表 —— 下次启动 `dsh web` 时 cordis.patch.yml 层自动生效。

手工方式（不用 CLI）：在 `$DSH_HOME/profiles/web/package.json` 的 `dependencies` 里加 `"dsh-slide-bar": "link:/path/to/dsh-slide-bar"`，在 `dsh.profile.bundles` 数组末尾追加 `"dsh-slide-bar"`。

## 开发

```sh
pnpm install          # 链接 dsh 仓库的接口包（link: devDependencies）并安装工具链
pnpm run bundle       # tsc 产出 lib/types，tsdown 产出 lib/index.js、lib/invariant.js、lib/client.js
pnpm vitest run       # 35 个单元测试（jsdom 由各 spec 首行 pragma 指定）
pnpm run typecheck    # 仅类型检查
```

注意：

- 依赖的 `@deepseek-ai/*` 包通过 `link:` 指向 dsh 仓库工作树；类型解析走各包已构建的 `lib/types`（需要 dsh 仓库先 `pnpm run build` 过），vitest 则通过 alias 直接解析到各包 `src`。
- 改完源码要重新 `pnpm run bundle` 再刷新浏览器 —— dsh 的 modules 服务伺服的是 `lib/client.js`，不是源码。
- 构建产物 `lib/client.js` 是 closure-factory 格式（`window.__ModuleLoader__.load({id, factory})`），react、cordis、ui-slots、ui-primitives 等平台模块由 dsh 的模块表注入，其余依赖（如 clsx）全部内联。

## 面板行为

面板根据外壳的 `activePanelId` owner prop 自门控：其他面板激活时渲染 null。树的数据动词（listDirectory / openPath）通过注册时的 inject 面传入，组件只见 props 不见 ctx。Host 返回的条目已排好序（目录在前、文件在后，各自按名称排序），客户端不重排，只按 Host 的 hidden 标记过滤（头部开关可显示隐藏文件）。被 Host 在完整结果上界处截断的层会在末尾显示「仅显示部分内容」提示。头部「刷新」保留展开状态、丢弃列表缓存和错误标记，从而重新拉取所有仍展开的层。

## 已知限制

- 文件只能在系统默认程序中打开，没有应用内编辑器或预览。
- 没有文件系统监听：外部改动要等手动刷新、展开未缓存目录或重挂载后才可见。
- 面板只读：不提供创建/重命名/删除/移动等文件操作。
