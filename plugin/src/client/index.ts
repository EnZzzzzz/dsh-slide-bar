/**
 * File explorer plugin, browser half. Two registrations into the sidebar
 * shell's activity-bar holes: ExplorerActivityIcon fills `sidebar.activity`
 * (selecting panel id 'explorer'), ExplorerPanel fills `sidebar.panel` (the
 * self-gated file tree). Both slots are declared by ui-sidebar's apply, whose
 * activation order relative to this one is NOT constrained: dsh.client.inject
 * edges are informational (loading/prefetch metadata, never apply sequencing),
 * so registration follows each declaration through `slots.inject()`. Export
 * discipline: packages/client/AGENTS.md.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { ExplorerActivityInjected, ExplorerPanelInjected } from './contract/slots.ts'
import { createExplorerStore } from './stores.ts'
import { ExplorerActivityIcon } from './ExplorerActivityIcon.tsx'
import { ExplorerPanel } from './ExplorerPanel.tsx'
import { en, zh } from './locales.ts'

export type {
  ExplorerActivityIconProps, ExplorerActivityInjected, ExplorerPanelInjected, ExplorerPanelProps,
} from './contract/slots.ts'
export type { ExplorerKey } from './locales.ts'

/** Dictionary namespace owned by this plugin. */
const NS = 'explorer'

/** The panel id both registrations carry (the `sidebar.panel` entry id IS the panel id). */
const PANEL_ID = 'explorer'

/** Services required by the explorer plugin. */
export const inject = ['slots', 'workspaces', 'locale']

/**
 * Register the activity icon and the panel once their slot declarations are
 * on the ledger. Inject factories return plain data and callbacks; the
 * listing wrapper fixes `includeFiles: true` so the tree shows files.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-explorer: dictionaries')

  ctx.slots.inject('sidebar.activity', () => ctx.slots.register(
    {
      name: 'sidebar.activity',
      id: PANEL_ID,
      order: 10,
      locale: NS,
      inject: (): ExplorerActivityInjected => ({ panelId: PANEL_ID }),
    },
    ExplorerActivityIcon,
  ))
  ctx.slots.inject('sidebar.panel', () => ctx.slots.register(
    {
      name: 'sidebar.panel',
      id: PANEL_ID,
      order: 10,
      store: createExplorerStore(),
      locale: NS,
      inject: (): ExplorerPanelInjected => ({
        panelId: PANEL_ID,
        listDirectory: (path, signal) => ctx.workspaces.listDirectory(path, { includeFiles: true }, signal),
        openPath: path => ctx.workspaces.openPath(path),
      }),
    },
    ExplorerPanel,
  ))
}
