# dsh-slide-bar — 运行时插件（runtime-plugin）

自包含的 dsh 运行时插件：**不改动 `deepseek-harness` 仓库**，用 dsh 自带的动态 Cordis 插件机制，在当前运行中的 dsh 里落地「VSCode 式左侧边栏」（活动栏 + 可切换面板 + 资源管理器文件树）。

这是需求里「重新设计项目架构」的成果：把原先「侵入式改 dsh 框架 + 外部 TS 包」两段式结构，收敛成一份纯 JS 的自包含运行时插件，直接在本 GUI 里定义、运行、验证。

## 文件

- `host.js` —— Host 半边（`code.host` 的 exact body）。通过 `ctx.get('fs')` 的 `listDir` 列目录（文件+目录、目录优先排序、隐藏标记、500 条截断），暴露 `host.call('list-directory', …)` RPC。`fs` 是后端无关的（本地 / 沙箱 / 远程同一接口），所以 R2.8 的两种部署形态天然满足。
- `client.js` —— Client 半边（`code.client` 的 exact body）。`slots.register` 以 `priority: -1` 重绘 `sidebar` 槽位，声明 `sidebar.activity`（list）+ `sidebar.panel`（list）两个子槽位，注册「会话」「资源管理器」两个图标/面板；文件树按需懒加载，点文件走 `ctx.workspaces.openPath`。

## 架构要点

1. **重绘 `sidebar`（single 槽位，`shadows-shipped-ui`）**：用 `priority: -1` 把内置的 `ui-sidebar` SidebarRoot 影子掉，换成自带的 shell（活动条 + 面板区）。
2. **活动栏 + 面板切换**：shell 持有 `activePanelId`（localStorage `dsh.sidebar.view.v1` 持久化），通过 `renderSlot` 把 `activePanelId`/`selectPanel`/`wide` 作为 owner props 下发给子槽位；图标点击切换并高亮，面板按 `activePanelId !== panelId` 自门控渲染 null。
3. **资源管理器**：把 `plugin/src/client/ExplorerPanel.tsx` + `stores.ts` 的设计/算法原样移植成纯 JS（`useReducer` 视图状态 + localStorage 持久化 + 每路径一个 `AbortController` + 懒加载/重试/截断/隐藏文件开关）；行级右键菜单支持「复制路径 / 复制相对路径 / 添加到会话」（后者经 `ctx.get('conversation').input.for(binding.ctx).setDraft` 把路径追加进当前会话的组合框草稿）。
4. **目录数据**：Client 用 `host.call('list-directory', …)` 经 Host 的 `fs.listDir` 取数（`ctx.workspaces.listDirectory` 在干净仓库里只列目录、无 `kind`，不够文件树用）。

## 关键约束（为什么活动栏必须这样做）

dsh 的 slot 系统规定：**子槽位只能由注册父槽位的那个 entry 的 `children` 声明；且影子（shadow）不会销毁被影子的 entry**（见 `packages/client/ui-slots/src/index.ts` 的 `register` / `releaseEntry` / `entriesOfSlot`）。因此：

- 一个纯插件**无法**在重绘 `sidebar` 的同时再重新声明并渲染既有的 `sidebar.workspaces` / `sidebar.settings`（会抛 `slot "…" is already declared`）；
- 也无法用 `renderSlot` 渲染自己没声明的子槽位（抛 `SlotOwnershipError`）。

这正是你之前那版「侵入式改动」把活动栏放进 `ui-sidebar` 的根本原因。本插件的取舍：**用自带的轻量「会话」面板（`useSessions`/`useWorkspaces` 渲染工作区+会话列表）替代原有工作区浏览器作为默认面板**，并在 shell 里省略了 settings 座位。若要把真正的 `sidebar.workspaces`/`sidebar.settings` 保留下来，唯一无回归的路径仍是给 `ui-sidebar` 做那处活动栏外壳的最小框架改动。

## 运行与验证

```sh
# 定义（code.host / code.client 分别取 host.js / client.js 内容）
#   cordis_define  idPrefix: slide  → slide-1/pkg-N
# 运行
#   cordis_run slide-1 pkg-N run
```

已验证（本会话）：

- `slide-1/pkg-2` 运行成功（`currentPackageId: pkg-2`，无 host/client 失败）。
- slot ledger 确认：`sidebar` 的 active occupant 是 `dyn/slide-1`（priority −1），内置 `B5` 被影子；`sidebar.activity` / `sidebar.panel` 已声明且 `sessions`/`explorer` 两个 entry 均 active。
- 额外发现：当前 harness 构建里**已经装有原 `dsh-slide-bar` 包**（页面出现 `data-plugin="dsh-slide-bar"` 样式标签），它通过 `slots.inject('sidebar.activity'/'sidebar.panel')` 等待槽位声明——本插件声明槽位后它会「醒来」，其 `explorer`（order 10）被本插件的 `explorer`（更低 priority）影子掉，不会重复显示。这说明原 `plugin/` 包的 `slots.inject` 架构本身是正确且与本插件兼容的。

## 已知限制

- 视觉截图验证受限于会话环境（动态 Client 插件只注入到当前会话的页面，新开的浏览器标签页收不到；`read_image` 亦不可用），故以 slot ledger 的程序化验证为准。
- 「会话」默认面板是轻量实现，非原 `ui-workspace` 浏览器：一级为可折叠的工作区（文件夹图标 + chevron + 会话数），展开后列出该工作区下全部会话（状态点 + 标题 + 相对时间），游离会话归入「未分组」；展开状态持久化，并自动展开当前会话所在的工作区。settings 座位在重绘 shell 中未保留（见上「关键约束」）。
- 打开文件走 `ctx.workspaces.openPath`（系统默认程序）；无应用内编辑器/预览、无文件写操作、无自动刷新。
