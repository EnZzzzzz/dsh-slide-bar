# dsh-slide-bar

独立于 dsh 仓库的 dsh Web UI 插件：VSCode 式左侧边栏「资源管理器」文件树面板（从 dsh monorepo 的 `packages/client/ui-explorer` 迁出）。

## 项目结构

- `plugin/` — 插件包本体（`dsh-slide-bar`，含源码、测试、构建配置与 `cordis.patch.yml` bundle 层）。用法与开发说明见 [plugin/README.md](plugin/README.md)。
- `runtime-plugin/` — **自包含运行时插件**（不改 dsh 仓库、纯 JS、直接在当前 dsh 里运行验证）：活动栏 + 可切换面板 + 资源管理器文件树 + 会话面板右键菜单（文件夹复制路径 / 会话分叉·归档）。见 [runtime-plugin/README.md](runtime-plugin/README.md)。
- `packaged/` — **正式安装包**（`dsh-sidebar-live`）：把 runtime-plugin 包装成持久化 bundle，装进 web profile 后重启自动生效；文件数据走 rc08 的 `ctx.remote.fileReferences` 通道。见 [packaged/README.md](packaged/README.md)。
- `docs/` — dsh 侧接口参考（`dsh-ui-plugin-interface.md`：cordis 插件骨架、slot 系统、store、ClientContext 服务面等，标注了 dsh 源码出处）与需求文档 `REQUIREMENTS.md`。

## 快速开始

```sh
cd plugin
pnpm install
pnpm run bundle
pnpm vitest run
```

安装到 dsh web profile 见 plugin/README.md 的「安装」一节。
