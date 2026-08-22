# dsh UI 插件接口参考

本文固化 dsh（DeepSeek Harness）Web UI 插件开发所需的接口，供左侧边栏面板插件（activity bar + 文件浏览器）开发查阅。只收录本项目用到的接口；每条标注 dsh 源码出处（仓库根：`/Volumes/DataDrive/proj/public/deepseek-harness`），细节以源码为准。

## 1. Cordis 插件最小骨架

dsh 一切皆为 cordis 插件。函数型插件命名导出 `name` / `inject` / `Config` / `apply`，**不得有默认导出**（混用会让 Loader 丢弃 inject 元数据）。

```ts
export const name = 'my-plugin'
export const inject = ['slots', 'locale']          // 声明服务依赖，加载顺序由服务等待推导
export function apply(ctx: Context): void {
  ctx.effect(() => {
    // 所有贡献（注册）都是 effect；返回 disposer，卸载/HMR 自动回收
    return () => { /* cleanup */ }
  }, 'my-plugin: label')
}
```

`ctx.effect`（`vendor/cordis/src/fiber.ts:415`）：

```ts
effect(execute: () => SyncEffect, label?: string): Disposable<Promise<void>>
effect(execute: () => Effect, label?: string): AsyncDisposable<Promise<void>>
// Effect = 单个 disposer | Promise<disposer> | 可迭代的多个 disposer
```

返回的 disposer 幂等、可 await；fiber 已处置时抛 `CordisError('INACTIVE_EFFECT')`。

## 2. Slot 系统（UI 唯一组合 API）

服务：`ctx.slots: SlotRegistry`（`packages/client/runtime/src/client/slots.ts`）。核心类型在 `packages/client/ui-slots/src/index.ts`。

### 2.1 槽位声明（declaration merging）

```ts
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'sidebar.panel': { kind: 'list'; scope: 'root'; owner: SidebarPanelOwnerProps }
  }
}
// SlotKind = 'single' | 'list' | 'keyed' | 'chain'
// SlotScope = 'root' | 'session-maybe' | 'session'
```

规则：**子槽位只能由注册父 entry 的那个 register 调用的 `children` 声明**（声明=渲染授权=排他）；渲染未声明的槽或重复声明会在加载期失败。槽位名镜像组合路径：`<domain>.<entry>.<hole>`。

### 2.2 register

`ui-slots/src/index.ts:527-550, 741-785`：

```ts
ctx.slots.register({
  name: K,                 // 目标 slot key（往已有槽位填组件）
  children?: D,            // 本组件声明的子槽位 { [slotName]: { kind, scope } }
  store?: H,               // StoreHandle 或 StoreFactory（见 §4）
  locale?: N,              // LocaleNamespaceMap 的命名空间 key
  registrant?: string,     // 诊断标签
  inject?: (…args) => I,   // inject 工厂，返回普通数据/回调（InjectFace）
  // kind 特定字段（ui-slots/src/index.ts:481-509）：
  //   single: { priority? }
  //   list:   { id, order?, label?, priority? }   ← id 标识条目，order 控制排序
  //   keyed:  { key, priority? }
  //   chain:  { select, priority? }
}, Component)              // 返回 disposer
```

`inject` 工厂参数（`InjectParams`，index.ts:460-467）：root scope 无参（有 store 时传 `actions`）；session scope 传 `sessionId`（有 store 时追加 `actions`）。

### 2.3 跨包注册：slots.inject

`runtime/src/client/slots.ts:143`：

```ts
inject(key: keyof SlotMap & string, callback: () => SlotInjectionEffect): () => void
// SlotInjectionEffect = (() => void) | Iterable<() => void>   ← 单 disposer 或 yield 多个的同步 generator
```

等目标槽位声明出现后执行 factory，声明消失时回收，重声明后重跑。往别人的槽位注册**必须**走这个（apply 顺序无约束）。

```ts
ctx.slots.inject('sidebar.panel', () => ctx.slots.register({ name: 'sidebar.panel', id: 'explorer', ... }, Panel))
```

辅助方法：`entries(key)` / `subscribe(key, fn)` / `spec(key)` / `getVersion(key)`（runtime/src/client/slots.ts:286-351）。

## 3. 组件 props：四个 share

```ts
// ui-slots/src/index.ts:442-450
type ComposedProps<K, EntryKey, S, H, I, M, N> =
  PropsRuntime<K, EntryKey> & PropsRenderSlots<S> & PropsStore<H> & InjectFace<I>
  & MatchedShare<SlotMap[K], M> & PropsLocale<N>
```

- `PropsRuntime<K>`：owner props（父组件 renderSlot 时传入）+ scope 标准 props + 全局标准 props
  - scope `'session'`：`useSession: SnapshotSelectorHook<ConversationSnapshot>`、`sessionId: SessionId`
  - scope `'session-maybe'`：同上但可空
  - 所有 scope：`useSessions: SnapshotSelectorHook<SessionListState>`、`useWorkspaces: SnapshotSelectorHook<WorkspaceListState>`
- `PropsRenderSlots<S>`：`{ renderSlot(key, ownerProps) }`；有 chain 子槽追加 `renderSlotChain`；声明了 session 子槽追加 `SessionProvider`
- `PropsStore<H>`：`{ useStore: SnapshotSelectorHook<T>; actions: BakedActions<T, A> }`（H 为 store handle 时）
- `PropsLocale<N>`：`{ t: TranslateNS<N> }`

支撑类型：

```ts
// ui-slots/src/renderer.ts:31
interface HostObservable<T> { getSnapshot(): T; subscribe(fn: () => void): () => void }
// ui-slots/src/store.ts:8
type SnapshotSelectorHook<T> = <S>(sel: (s: T) => S, eq?: (a: S, b: S) => boolean) => S
```

纪律（`packages/client/AGENTS.md`）：组件只见 props 不见 ctx；inject 工厂只返回普通数据与回调；registrant 私有响应式事实走 inject 的 `hooks` 隔间（`HostObservable`，渲染器绑定成 `use<Name>` hook）。

## 4. Store 引擎

`packages/client/runtime/src/client/contract/store.ts`：

```ts
defineStore<T, A>({ init: () => T, persist?: string, actions: A }): EngineStoreHandle<T, A>
// persist = localStorage key 字符串（整体 JSON 持久化；存储失败只禁用持久化不崩）
// 例：persist: 'dsh.workspace.view.v5'

handle.create(scopeKey?: string): EngineStoreInstance<T, A>  // session 作用域传 sessionId（作 persist key 后缀）
// EngineStoreInstance = { actions, getSnapshot(), subscribe(fn), clearPersisted(), store: SnapshotStore<T> }
```

规则：store 工厂模块级导出（`createXXXStore()`），**禁止模块级 handle**；生产代码只在 `apply` 里调工厂；测试可直接 `createXXXStore().create()`。读 `props.useStore(sel)`，写 `props.actions.*`。actions 用 immer draft 风格原地改写。

## 5. ClientContext 服务面

`ClientContext = Context`（`runtime/src/client/index.ts:112`）。服务 key 经 declaration merging 合并到 cordis `Context`。

### 5.1 `ctx.sessions: ISessions`（`runtime/src/client/contract/sessions.ts:26-130`）

```ts
interface ISessions {
  readonly list: ObservableSnapshot<SessionListState>
  readonly searchResultLimit: number
  open(id: SessionId): void
  clear(): void
  search(query: string, signal: AbortSignal): Promise<RpcResult<{ items: SessionSearchResultItem[]; hasMore: boolean }>>
  fork(opts: { sessionId: SessionId; atSeq?: number; increaseTitle?: boolean }): Promise<SessionId>
  binding(id: SessionId): SessionBinding | undefined   // { sessionId, session: SessionFace, ctx: AgentContext }
  // create() 不在接口上，在具体类 SessionRuntime 上：
  // create(opts?: { workspaceId?; cwd?; sessionId? }): Promise<SessionId>
}
// SessionListState = { ids, byId, current, phase, subagentsByParent, jobsBySession, currentAddress }
// byId[id]（session summary）含 cwd、blank、updatedAt 等
```

### 5.2 `ctx.workspaces: IWorkspaces`（`runtime/src/client/contract/workspaces.ts:14-94`）

```ts
interface IWorkspaces {
  readonly list: ObservableSnapshot<WorkspaceListState>
  connectWorkspace(workspaceId: WorkspaceId): Promise<SessionId>
  startSession(workspaceId?: WorkspaceId): void
  create(input: { path: string }): Promise<WorkspaceView>
  pickDirectory(): Promise<string | null>
  listDirectory(path?: string, signal?: AbortSignal): Promise<DirectoryListing>  // 本计划将加 options 参数
  createDirectory(path: string, name: string): Promise<string>
  openPath(path: string): Promise<void>          // 系统默认程序打开
  rename / delete / insertBefore / insertSessionBefore / archiveSession …
}
// WorkspaceListState = { items: WorkspaceView[], archivedSessionIds, state, phase, error, baselinesReady, recentWorkspaceId }
// WorkspaceView 含 workspaceId、path、title、sessionIds、createdAt
```

### 5.3 `ctx.locale: LocaleRuntime`（`packages/client/locale/src/client/index.ts`）

```ts
register<N>(ns: N, dicts: Record<LocaleId, LocaleDictOf<N>>): () => void   // zh/en 必须齐全，否则编译错误
// 用法：ctx.locale.register('explorer', { zh, en })
```

`t(key, params?)` 查找链：ns@当前 locale → ns@zh（fallback）→ common 命名空间 → key 本身。插值 `{name}` 模板替换，缺参保留原样。组件经 `PropsLocale<N>` 收 `t`。命名空间经 declaration merging 注册：

```ts
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { explorer: ExplorerKey }   // 值 = 字典 key 的 union
}
```

### 5.4 `ctx.layout: ILayout`（`ui-layout/src/client/service.ts:23-30`）

```ts
interface ILayout { toggleSidebar(): void; openDetails(): void; closeDetails(): void }
```

### 5.5 `ctx.theme: ThemeRuntime`（`ui-theme/src/client/index.ts`）

`getTheme()` / `setTheme(id)` / `register(def)` + HostObservable 形态。本项目用不到。

## 6. Wire 层（host.listDirectory 全链路）

浏览器 → host 的调用链：

```
组件 inject 回调
 → ctx.workspaces.listDirectory()          packages/client/runtime/src/client/workspaces/service.ts:223
 → IApiClient.host.listDirectory(payload, signal)   packages/host/apiproxy/src/fetch/client.ts:111
 → POST /api/host.listDirectory            fetch/handler.ts:109（zod 校验 schema）
 → api-proxy.ts:2909 实现                   走 ctx.directoryPicker.capability() 的 browse 分支
 → DirectoryPickerBrowseCapability.list()  packages/host/directory-picker/src/index.ts:77
 → browse provider 实现                     packages/host/directory-picker-browse/src/index.ts:217
```

关键结构：

```ts
// apiproxy/src/api/rpc.ts:105-140
type RpcResult<T> = { ok: true; value: T } | { ok: false; error: RpcError }
interface RpcResponse<T> { rpcId: RpcId; result: RpcResult<T> }
type RpcError = { code, message, details }   // 业务错误不抛出，走 ok:false；传输异常折叠成 code:'internal'

// apiproxy/src/api/host.ts
interface DirectoryEntry { name: string; path: string; hidden: boolean }        // 本计划加 kind
interface DirectoryListing { path: string; home: string; crumbs: DirectoryEntry[]; entries: DirectoryEntry[]; truncated: boolean }
```

zod schema 在 `apiproxy/src/api/host.schema.ts`（`directoryEntrySchema`、`hostListDirectoryRequestSchema`、`hostListDirectoryValueSchema`），方法路由在 `fetch/handler.ts` 的 handler 表 + `api/rpc-map.ts` 的类型映射。

host 侧 capability：

```ts
// directory-picker/src/index.ts:63-87（本计划给 list 加 options 参数）
interface DirectoryPickerBrowseCapability {
  kind: 'browse'
  list(path?: string, signal?: AbortSignal): Promise<DirectoryListing>
  createDirectory(path: string, name: string): Promise<string>
}
```

browse provider 的 `maxEntries` 是 Config 字段（默认 1000），上界作用于完整结果，截断置 `truncated: true`。

## 7. 新包落地清单

来源：`packages/client/AGENTS.md:90-98`，模板包 `packages/client/ui-workspace`。

一个 `packages/client/<name>/` 插件包需要：

- `package.json`：`@deepseek-ai/dsh-client-<name>`；`"type": "module"`；exports `.` / `./invariant` / `./client` / `./src/*` / `./package.json`；`dsh.client = { platform: 'web', inject: [...] }`（inject 仅 informational，不定序）；deps 模式：`clsx` 进 dependencies，workspace 包进 peerDependencies + devDependencies；`files` 列 lib 产物
- `tsconfig.json`：extends `../../../tsconfig.base.client.json`，`rootDir: src`、`outDir: lib/types`，references 逐个 workspace 依赖 + `../../runtime-diagnostics/invariants`
- `tsdown.config.ts`：`clientBundle('@deepseek-ai/dsh-client-<name>', ['lib/types/index.js', 'lib/types/invariant.js'])`（preset 在 `packages/client/tsdown.client.ts`）
- `src/index.ts`：node 半边，纯 UI 插件就是空 apply
- `src/invariant.ts`：invariant companion（无可查关系时给 package-specific 的 `No runtime invariant:` 理由；模板照 ui-workspace，注意 `jscpd:ignore` 注释）
- `src/css-modules.d.ts`：用 CSS Modules 时需要
- `src/client/index.ts`：浏览器半边，`export const inject` + `apply(ctx: ClientContext)`
- `tests/`：包级 `tests/` 目录（不是 `src/__tests__`）；jsdom 用 `// @vitest-environment jsdom` 首行 pragma
- `README.md` + `README.zh.md` + `README.i18n.yaml`：含 `## Model Experience`（纯 UI 写 None）与 `## Known Limitations and Deferred Work` 节

三个注册面缺一不可：

1. 根 `tsconfig.client.json` 的 `references` 加 `{ "path": "./packages/client/<name>" }`
2. `packages/bundle/web-app/cordis.patch.yml` 加 roster 行 `- id: <name>` / `name: '@deepseek-ai/dsh-client-<name>'`
3. `packages/bundle/web-app/package.json` dependencies 加 `"@deepseek-ai/dsh-client-<name>": "workspace:^"`

构建后为 live 服务重新打包：`pnpm --filter <pkg> bundle`（registry 伺服 `lib/client.js` 而非源码）。

## 8. 仓库硬性义务速查

- client src 在 per-file 100% coverage gate（`pnpm run test:coverage`）；不可达防御分支用 `/* v8 ignore -- 理由 */`
- 非平凡改动同 PR 附 `.agents/notes/` Agent Note（格式见 `.agents/notes/README.md`）
- 产品文案中文、代码注释英文；CSS 只用 `--dsw-*` token + CSS Modules + clsx，无字面色值/Tailwind
- 导出纪律：UI 插件 `/client` 入口只导出 cordis 加载所需（apply/inject/Config + store 工厂类型 + 共享类型）
- 跨包 import 其他插件符号原则禁止；type-only 拉 SlotMap merge 是惯例（`import type {} from '.../client'`）
- 验证命令：`pnpm run test:gui`（内层循环）→ `pnpm run typecheck` / `pnpm run lint` → 可见输出变化加 `DSH_SNAPSHOT=replay pnpm run test:web`
