# Agent Note: Sidebar activity bar and switchable panels

Status: implemented

[English](2026-08-22-sidebar-activity-bar-panels.md) | 中文

## Problem

dsh Web UI 的左列此前只有一个固定的浏览区——占用 `sidebar.workspaces` 槽的会话/工作区浏览器——没有让插件贡献「可切换功能面板」的机制，因此文件浏览器之类的面板没有落点。同时浏览器侧的 `host.listDirectory` 只列目录不列文件，文件浏览器缺少文件数据通道。

## Decision

### Activity bar 与面板槽（ui-sidebar）

`packages/client/ui-sidebar` 中 layout 拥有的 `'sidebar'` entry 声明两个子槽：`'sidebar.activity'`（list 类型、root 作用域），每个注册是一个图标按钮，其注册 `id` 即面板 id、`order` 决定条内排序——壳内置的「会话」图标固定最前；以及 `'sidebar.panel'`（list 类型、root 作用域），每个注册是一个可切换面板，其注册 `id` 即面板 id。面板自门控：当 owner 的 `activePanelId` 与自身 id 不匹配时渲染 null，因为壳渲染整个列表、无从得知各 id。选择存在新 store `createSidebarViewStore`（persist key `dsh.sidebar.view.v1`，默认 `'workspaces'`）。既有的 `sidebar.workspaces` 槽成为内置默认面板，ui-workspace 原样占用、零改动。宽态下区域变为横向两栏（40px 活动条加面板区）；rail 态下活动图标并入 rail 列，点击选中对应面板并展开列。持久化的选择指向已卸载面板时回退到 workspaces 视图，由 `sidebar.panel` 槽占用事实驱动：该事实经 inject `hooks` 隔间以 `HostObservable` 传入，渲染器把它绑定为 `usePanelAvailable`，沿用 ui-workspace 的 flowSource 范式。组合遵循[槽系统标准](../architecture/2026-07-22-slot-type-chain-implementation.md)；面板插件经 [slots.inject](../architecture/2026-08-05-slot-declaration-injection.md) 注册。

### 参考面板：仓库外独立的 ui-explorer 包

参考面板「文件资源管理器」以仓库外独立包 `@deepseek-ai/dsh-client-ui-explorer` 提供，经 profile bundle 路径安装：profile 以 `link:` 依赖声明它，包自带的 `dsh.bundle` patch 把它的 `dsh.client` roster 行自动成层到 web-app 组合上。文件树每次请求懒加载一层目录，每个路径的在途请求由 `AbortController` 管理。根目录推导自当前会话的 cwd，回退到最近使用的工作区，再回退到空态。其 store `createExplorerStore` 持久化于 `dsh.explorer.view.v1`：展开状态、单层列表缓存、loading/error/truncation 标记、显示隐藏文件开关。点击文件经 `host.openPath` 用操作系统默认程序打开；区头提供刷新与显隐隐藏文件控件。

### Wire 扩展：文件列举

browse capability 的 `DirectoryEntry` 增加 `kind: 'directory' | 'file'`；`DirectoryPickerBrowseCapability.list(path?, options?: { includeFiles?: boolean }, signal?)` 仅在 `includeFiles: true` 时把该层文件并入结果——缺省行为不变，只列目录。条目排序目录在前、文件在后，各自按名称排序；`maxEntries` 上界作用于合并结果。列举同时与 picking 交互解耦：Service Definition 新增 `DirectoryPickerListing` 面（去掉辨识符的 browse 原语），`DirectoryPicker.listing()` 由每个后端经 definition 包内共享的 `createLocalListing` 引擎提供（native 后端把 `maxEntries` 做成 Config 字段，默认 1000），apiproxy 的 `host.listDirectory`／`host.createDirectory` 改为消费 `listing()` 而不再按 `capability().kind` 分支——因此 explorer 在 native 组合下同样可应答，`directory-picker-unavailable` 分支只保留在 `host.pickDirectory` 上。链路为 directory-picker（Service Definition）→ directory-picker-browse（provider）→ apiproxy（`host.listDirectory` 的 schema/handler/proxy）→ client runtime 的 `IWorkspaces.listDirectory`（同签名透传）。这扩展了[directory-picker 能力缝笔记](../architecture/2026-07-28-directory-picker-capability-seam.md)；缝决策本身不变。

## Alternatives considered

- **动态插件路线（ui-cordis / cordis-client-runner）**：运行时定义临时面板，不动 monorepo。否决：runner 定义的贡献做不了 activity bar 级别的布局改造，且能力受沙箱限制——只适合做原型。
- **新面板槽由新包自己声明。** 否决：子槽只能由注册父 entry 的包声明（槽声明纪律），因此 `'sidebar'` entry 的 activity 与 panel 孔位必须落在 ui-sidebar。
- **文件列举走 `ctx.fs`。** 否决：web-app host plane 没有挂载 fs provider（只有 preset 挂载），apiproxy 摸不到；扩展已有的 browse capability 是唯一能到达浏览器的路径。
- **面板切换用 single 槽轮换占用。** 否决：single 槽同时只允许一个注册，多个面板插件会互相挤占；list 槽加自门控让所有面板共存，壳只做选择。

## Consequences

得到：插件化的面板扩展点——任何包用两个 `slots.inject` 注册即可加一个面板；ui-workspace 零改动；折叠动画语义不变。代价：`SidebarRoot` 布局变复杂（两栏加兜底分支）；持久化的 `activePanelId` 指向已移除插件时静默回退 workspaces 视图（有意为之）。工作区浏览器自身的排序与折叠行为仍由[工作区侧栏排序与折叠笔记](2026-08-11-workspace-sidebar-order-and-folding.md)拥有。

## Testing

- ui-sidebar：store、apply 与 `SidebarRoot` 组件规格（活动条、切换、兜底、rail 行为）；scoped coverage 100%。
- 仓库外的 ui-explorer 包自带测试套件（store、面板、活动图标、apply 与 invariant）。
- Host 链路：browse provider（文件列出、排序、截断）、apiproxy schema 与 handler、runtime workspaces service 规格。
- `pnpm run test:gui` 全绿；typecheck、oxlint、verify-export-jsdoc、verify-package-invariants、verify-cordis-config 全绿。

## Deferred

文件只能用系统默认程序打开（无应用内编辑器面板）；无文件监听自动刷新；无文件新建、删除、重命名；面板顺序不可拖拽。
