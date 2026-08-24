/**
 * Sessions panel slot contract: the registrant-side props composition for the
 * sidebar shell's activity-bar holes. This package fills `sidebar.activity`
 * with one chat icon (its own panel id rides its inject face) and
 * `sidebar.panel` with the inherited workspace browser (SessionsPanelHost),
 * which self-gates on the shell's activePanelId. All browser data verbs and
 * the viewing store come from the workspace fork (see workspace/contract);
 * this file only declares the panel identity + the activity icon props.
 */
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls ui-sidebar's SlotMap merges (the 'sidebar.activity' entry).
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'

/**
 * Activity-entry injected share: the panel id this icon selects and
 * highlights against. The shell's owner share carries activePanelId and
 * selectPanel; the entry only needs to know who it is.
 */
export type SidebarActivityInjected = {
  /** This registration's panel id (the `sidebar.panel` entry id). */
  panelId: 'sessions'
}

/**
 * The sessions activity icon's locale seat: the sidebar.sessions dictionary
 * (registered by this package) already carries activity.sessions.
 */
export type SidebarActivityLocale = PropsLocale<'sidebar.sessions'>

/**
 * Full sessions activity-icon props: shell owner share (wide / activePanelId /
 * selectPanel / expandSidebar) + own panel id + the sidebar.sessions locale
 * seat.
 */
export type SessionsActivityIconProps =
  PropsRuntime<'sidebar.activity'>
  & SidebarActivityInjected
  & SidebarActivityLocale
