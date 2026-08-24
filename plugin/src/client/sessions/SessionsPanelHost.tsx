/**
 * Sessions panel host: adapts the shell's `sidebar.panel` owner share
 * (SidebarPanelOwnerProps: wide / activePanelId / expandSidebar) to the
 * inherited workspace browser (WorkspaceBrowser), self-gates on the sessions
 * panel id, and forwards the panel's inject/share props through.
 *
 * This is the fork-side seam between the shell's list-slot contract and the
 * browser's single-slot contract: the browser never sees activePanelId (the
 * shell renders every list entry), so the host renders null while another
 * panel is active.
 */
import { WorkspaceBrowser } from '../workspace/WorkspaceBrowser.tsx'
import type { WorkspaceBrowserProps } from '../workspace/contract/slots.ts'

/**
 * Render the inherited sessions panel.
 * @param props - composed sidebar.panel slot props (shell owner + store +
 * injected actions + locale seat + directoryFlow share).
 * @returns the workspace browser, or null while another panel is active.
 */
export function SessionsPanelHost(props: WorkspaceBrowserProps) {
  // The shell renders the whole sidebar.panel list; each entry self-gates.
  if (props.activePanelId !== 'sessions') return null
  return <WorkspaceBrowser {...props} />
}
