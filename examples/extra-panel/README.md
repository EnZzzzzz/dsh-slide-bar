# examples/extra-panel — 第三个左侧 tab 的最小示例

演示「给 dsh 左侧边栏**加一个新面板**」的纯增量做法，不改 dsh 仓库、不碰
`sidebar` / `sidebar.workspaces` 这些 single 槽位，只往两个现成的 **list 槽位**
里各加一个 entry。

## 机制：tab = 一对同名 entry

当前 GUI 的左侧 tab 栏是 shell（`dsh-sidebar-live` 的 SidebarShell，装在
`sidebar.workspaces` 里）用一对 list 槽位渲染的：

| 槽位 | 内容 | entry 收到的 props |
| --- | --- | --- |
| `sidebar.activity` | 竖排图标条（每个 tab 一个图标按钮） | `{ panelId, wide, activePanelId, selectPanel }` |
| `sidebar.panel` | 右侧内容区（每个 tab 一个面板） | `{ panelId, wide, activePanelId, ...inject 返回值 }` |

一个 tab = **同一 `id`** 在两个槽位各注册一个 entry：

- `order` 决定位置（sessions=1、explorer=2，新面板用 3+）；
- `priority` 决定**同 id 冲突**时谁生效（沿用 shell 的 −1 约定即可）；
- 活动条 entry 是一个按钮：高亮看 `props.activePanelId === props.panelId`，
  点击调 `props.selectPanel(props.panelId)`；
- 面板 entry **自门控**：`props.activePanelId !== props.panelId` 时返回 `null`；
- 面板里需要会话/工作区数据时直接用标准 props hooks：
  `props.useSessions((s) => s)` / `props.useWorkspaces((s) => s)`。

## 运行

```sh
# code.client = examples/extra-panel/client.js 的完整内容（纯 JS，无 import）
# cordis_define  idPrefix: pins（或任意 3–6 位小写字母）→ 得到 pluginId/packageId
# cordis_run    <pluginId> <packageId> run
```

运行后左侧活动条出现第三个图标（★ 收藏），点击切换到「收藏」面板：
把当前会话的工作目录钉进去，点条目用系统默认程序打开。

## 扩展到需要真实数据的面板

本示例是纯 Client（localStorage 持久化）。若面板要读文件/进程/网络，参照
`runtime-plugin/host.js` 加 Host 半边：

- Host：`harness.handle('list-directory', async (args) => …)`（内部 `ctx.get('fs')`）；
- Client：`host.call('list-directory', { path })` 取数；
- 把返回的动词通过 `inject: () => ({ panelId: 'pins', listDirectory, … })`
  传进面板 entry。

## 注意事项

- 用 `slots.inject('sidebar.activity', …)` 等声明再注册（本文件已示范）：
  没有 shell 时插件保持惰性、不会报错；
- 图标、样式只用内置 Builtin（React / styles）和主题 token（`--dsw-alias-*`），
  不 import ui-primitives；
- 计时器不要用全局 `setTimeout`，要走 `timer` 服务（`inject: ['timer']`）；
- 动态 Cordis 插件只注入当前会话页面、进程重启后消失；要常驻就把同一份代码
  走 `plugin/` + `packaged/` 的打包安装路径（见仓库根 README）。
