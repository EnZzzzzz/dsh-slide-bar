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
- `src/client/index.js` — Client 半边：重绘 `sidebar`（priority −1）+ 活动栏 + 会话工作区树 + 资源管理器（右键菜单：复制路径/复制相对路径/添加到会话 → 原生 `@file` chip）。
- `build.mjs` — 无工具链构建：把 client 源码包进 `window.__ModuleLoader__.load({id, factory})` 闭包工厂（`React` 由 `require('react')` 解析），产出 `lib/client.js`；`lib/index.js` 为 ESM 空 host。
- `smoke.mjs` — 冒烟测试：加载闭包工厂、调用 `apply`（无 slots 早退 + 全量注册 5 个槽位）。
- `cordis.patch.yml` — bundle 层：把本包插入 web-app client roster。

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
- 树根仅支持当前会话 cwd；无当前会话时显示空态提示。
- 目录数据经 `fileReferences.list` 有 `maxResults` 上界，超出会截断并显示「仅显示部分内容」。
