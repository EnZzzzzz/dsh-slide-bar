/**
 * The sessions panel's activity-strip entry: one chat icon that highlights
 * while its own panel is active and selects it on click. Mirrors the explorer
 * icon (ExplorerActivityIcon): the shell provides the slot and the selectPanel
 * callback; the entry forwards the selection and paints its own highlight.
 */
import clsx from 'clsx'
import { IconNewChatOutline16, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SessionsActivityIconProps } from './contract.ts'
import css from './SessionsActivityIcon.module.css'

/**
 * Render the sessions activity icon.
 * @param props - shell owner share + own panel id + locale seat.
 * @returns the icon button.
 */
export function SessionsActivityIcon({
  wide,
  activePanelId,
  selectPanel,
  panelId,
  t,
}: SessionsActivityIconProps) {
  const active = activePanelId === panelId
  return (
    <Tooltip label={t('activity.sessions')} delayMs={500}>
      <button
        type="button"
        className={clsx(css.iconButton, !wide && css.rail, active && css.active)}
        aria-label={t('activity.sessions')}
        aria-pressed={active}
        onClick={() => { selectPanel(panelId) }}
      >
        {/* Rail icons render at 18 (figma rail spec); expanded keeps 16. */}
        <IconNewChatOutline16 size={wide ? 16 : 18} />
      </button>
    </Tooltip>
  )
}
