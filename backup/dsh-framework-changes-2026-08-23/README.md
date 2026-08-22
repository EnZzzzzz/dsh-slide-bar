# dsh 框架使能改动备份（2026-08-23）

这是从 `/Volumes/DataDrive/proj/public/deepseek-harness` 工作树撤下的全部未提交改动，包含两部分：

## 1. ui-sidebar activity bar 机制

- `sidebar.activity`（图标列）+ `sidebar.panel`（面板区）两个 list 槽位（`ui-sidebar/src/client/contract/slots.ts`）
- 活动面板选择 store（`ui-sidebar/src/client/stores.ts`，persist key `dsh.sidebar.view.v1`，默认 `workspaces`）
- `SidebarRoot.tsx` 宽态两栏布局（activity strip + 面板区）、rail 态图标并入、无 panel entry 时兜底回退 workspaces
- 面板自门控约定：registrant 的 `activePanelId` 与自己 id 不匹配时渲染 null

## 2. directory-picker listing seam + host.listDirectory 支持文件

- `DirectoryPicker` 服务定义新增正交面 `listing()`（`DirectoryPickerListing`），与 picking 交互（capability()）解耦；native/browse 后端都实现
- 列举引擎共享工厂 `createLocalListing`（`packages/host/directory-picker/src/local-listing.ts`）
- `DirectoryEntry.kind: 'directory' | 'file'`；`list(path?, options?: { includeFiles?: boolean }, signal?)`
- apiproxy `host.listDirectory`/`host.createDirectory` 走 listing 面（native 组合也可用）；client runtime `IWorkspaces.listDirectory` 同签名透传

## 文件说明

- `changes.patch`：66 个已跟踪文件的完整 diff（`git apply` 可用）
- `changes.stat`：diff 统计
- `untracked/`：7 个当时未跟踪的新文件（Agent Note 三联、ui-sidebar stores 及测试、local-listing 引擎及测试），按仓库相对路径存放

## 恢复方法

```sh
cd /Volumes/DataDrive/proj/public/deepseek-harness
git apply changes.patch
cp -R untracked/. .   # 恢复新文件
pnpm install          # lockfile 含在 patch 里，同步依赖
pnpm run test:gui && pnpm run typecheck && pnpm run doc-sync
```

注意：本备份不含文件浏览器插件本体——它在 `../../plugin/`（独立包 `dsh-slide-bar`，经 profile bundle 安装）。Agent Note 见 `untracked/.agents/notes/implemented/feature/2026-08-22-sidebar-activity-bar-panels.md`。
