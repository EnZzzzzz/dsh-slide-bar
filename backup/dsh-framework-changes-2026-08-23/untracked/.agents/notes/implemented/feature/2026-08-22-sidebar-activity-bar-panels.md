# Agent Note: Sidebar activity bar and switchable panels

Status: implemented

English | [中文](2026-08-22-sidebar-activity-bar-panels.zh.md)

## Problem

The dsh web UI's left column offered one fixed browsing region — the session/workspace browser occupying the `sidebar.workspaces` slot — with no mechanism for plugins to contribute switchable function panels, so a file browser or similar panel had no landing spot. The browser-side `host.listDirectory` also listed directories only, leaving a file browser without a data channel for files.

## Decision

### Activity bar and panel slots (ui-sidebar)

The layout-owned `'sidebar'` entry in `packages/client/ui-sidebar` declares two child slots: `'sidebar.activity'` (list kind, root scope), where each registration is one icon button whose registration `id` is its panel id and whose `order` sorts the strip — the shell's built-in Sessions icon is pinned first — and `'sidebar.panel'` (list kind, root scope), where each registration is one switchable panel whose registration `id` is the panel id. Panels self-gate: each renders null while the owner's `activePanelId` does not match its own id, because the shell renders the whole list and cannot know the ids. The selection lives in a new store, `createSidebarViewStore` (persist key `dsh.sidebar.view.v1`, default `'workspaces'`). The pre-existing `sidebar.workspaces` slot is the built-in default panel; ui-workspace occupies it unchanged. In the wide state the region becomes a horizontal two-column layout (a 40px activity strip plus the panel area); in the rail state the activity icons join the rail column, and clicking one selects its panel and expands the column. A persisted selection naming an uninstalled panel falls back to the workspaces view, driven by `sidebar.panel` slot occupancy: the fact arrives through the inject `hooks` compartment as a `HostObservable` the renderer binds to `usePanelAvailable`, following the ui-workspace flowSource pattern. The composition follows the [slot system standard](../architecture/2026-07-22-slot-type-chain-implementation.md); panel plugins register through [slots.inject](../architecture/2026-08-05-slot-declaration-injection.md).

### The reference panel: an external ui-explorer package

The reference panel, a file explorer, ships outside this repository as the standalone package `@deepseek-ai/dsh-client-ui-explorer` and installs through the profile bundle path: the profile declares it as a `link:` dependency, and the package's own `dsh.bundle` patch layers its `dsh.client` roster row onto the web-app composition automatically. The tree lazy-loads one directory level per request, with an `AbortController` managing the in-flight request per path. The root directory derives from the current session's cwd, falling back to the most recent workspace, then to an empty state. Its store `createExplorerStore` persists under `dsh.explorer.view.v1`: expansion, the one-level listing cache, loading/error/truncation markers, and the show-hidden toggle. Clicking a file opens it through `host.openPath` with the operating system's default application; the header carries refresh and show-hidden controls.

### Wire extension: file listing

The browse capability's `DirectoryEntry` gains `kind: 'directory' | 'file'`, and `DirectoryPickerBrowseCapability.list(path?, options?: { includeFiles?: boolean }, signal?)` adds the level's files only when `includeFiles: true` — the default keeps listing directories only. Entries arrive sorted directories-first, then files, each name-sorted; the `maxEntries` bound applies to the merged result. Listing is also decoupled from the picking interaction: the Service Definition gains a `DirectoryPickerListing` face (the browse primitives without the discriminant), `DirectoryPicker.listing()` is served by every backend from a shared `createLocalListing` engine in the definition package (the native backend takes `maxEntries` as a Config field, default 1000), and apiproxy's `host.listDirectory`/`host.createDirectory` consume `listing()` rather than switching on `capability().kind` — so the explorer answers under a native composition too, and the `directory-picker-unavailable` branch remains only on `host.pickDirectory`. The chain runs directory-picker (Service Definition) → directory-picker-browse (provider) → apiproxy (`host.listDirectory` schema/handler/proxy) → the client runtime's `IWorkspaces.listDirectory`, which passes the same signature through. This extends the [directory-picker capability seam](../architecture/2026-07-28-directory-picker-capability-seam.md); the seam decision stands.

## Alternatives considered

- **Dynamic plugin route (ui-cordis / cordis-client-runner)**: define an ad-hoc panel at runtime without touching the monorepo. Rejected: a runner-defined contribution cannot perform the activity-bar-level layout rework the shell needs, and sandbox restrictions limit its capability — the route suits prototypes only.
- **A panel package declaring the new slots itself.** Rejected: child slots can be declared only by the package that registers the parent entry (slot declaration discipline), so the activity and panel holes of the `'sidebar'` entry must live in ui-sidebar.
- **File listing through `ctx.fs`.** Rejected: the web-app host plane mounts no fs provider (only the preset mounts one), so apiproxy cannot reach it; extending the existing browse capability is the only path that reaches the browser.
- **Panel switching by rotating occupancy of a single-kind slot.** Rejected: a single slot admits one registration at a time, so several panel plugins would evict each other; a list slot plus self-gating lets all panels coexist while the shell only selects.

## Consequences

The gain: a plugin-driven panel extension point — any package adds a panel with two `slots.inject` registrations — while ui-workspace stays untouched and the collapse animation semantics do not change. The costs: `SidebarRoot` grows a two-column layout plus the fallback branch, and a persisted `activePanelId` naming a removed plugin silently falls back to the workspaces view (intentional). The workspace browser's own ordering and folding behavior stays owned by the [workspace sidebar order and folding note](2026-08-11-workspace-sidebar-order-and-folding.md).

## Testing

- ui-sidebar: store, apply, and `SidebarRoot` component specs (activity strip, switching, fallback, rail behavior); scoped coverage 100%.
- The external ui-explorer package carries its own suite (store, panel, activity icon, apply, and invariant).
- Host chain: browse provider (file listing, sorting, truncation), apiproxy schema and handler, and the runtime workspaces service specs.
- `pnpm run test:gui` green; typecheck, oxlint, verify-export-jsdoc, verify-package-invariants, and verify-cordis-config green.

## Deferred

Files open only in the system default application (no in-app editor panel); no file-watching auto-refresh; no file creation, deletion, or rename; panel order is not draggable.
