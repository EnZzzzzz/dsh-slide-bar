/**
 * The explorer's activity-strip entry: one folder icon that highlights while
 * its own panel is active and selects it on click. The shell's selectPanel
 * already expands the column when the click arrives from the collapsed rail
 * (SidebarRoot), so the entry only forwards the selection. Active chrome is
 * the entry's own: the shell provides the slot, each occupant paints its own
 * highlight (the same sidebar-nav active token the built-in icon uses).
 */
import clsx from 'clsx'
import { IconFolderOpenOutline16, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ExplorerActivityIconProps } from './contract/slots.ts'
import css from './ExplorerActivityIcon.module.css'

/**
 * Render the explorer activity icon.
 * @param props - shell owner share + own panel id + locale seat (contract/slots.ts).
 * @returns the icon button.
 */
export function ExplorerActivityIcon({
  wide,
  activePanelId,
  selectPanel,
  panelId,
  t,
}: ExplorerActivityIconProps) {
  const active = activePanelId === panelId
  return (
    <Tooltip label={t('activity.explorer')} delayMs={500}>
      <button
        type="button"
        className={clsx(css.iconButton, !wide && css.rail, active && css.active)}
        aria-label={t('activity.explorer')}
        aria-pressed={active}
        onClick={() => { selectPanel(panelId) }}
      >
        {/* Rail icons render at 18 (figma rail spec); expanded keeps 16. */}
        <IconFolderOpenOutline16 size={wide ? 16 : 18} />
      </button>
    </Tooltip>
  )
}
