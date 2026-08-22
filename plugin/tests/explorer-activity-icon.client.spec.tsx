// @vitest-environment jsdom
/** ExplorerActivityIcon: active highlight against the shell's activePanelId and selection on click. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { ExplorerActivityIconProps } from '../src/client/contract/slots.ts'
import { ExplorerActivityIcon } from '../src/client/ExplorerActivityIcon.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

const t: ExplorerActivityIconProps['t'] = makeTranslate(zh)

// The icon never reads the global hooks; they ride the standard props share.
const neverHook = (() => { throw new Error('activity icon must not read global hooks') }) as never

function mountIcon({ activePanelId = 'workspaces', wide = true }: { activePanelId?: string; wide?: boolean } = {}) {
  const selectPanel = vi.fn()
  render(
    <ExplorerActivityIcon
      wide={wide}
      activePanelId={activePanelId}
      selectPanel={selectPanel}
      expandSidebar={vi.fn()}
      panelId="explorer"
      useSessions={neverHook}
      useWorkspaces={neverHook}
      t={t}
    />,
  )
  return { selectPanel }
}

describe('ExplorerActivityIcon', () => {
  it('highlights only while its own panel is active', () => {
    mountIcon({ activePanelId: 'workspaces' })
    expect(screen.getByRole('button', { name: '资源管理器' }).getAttribute('aria-pressed')).toBe('false')
    cleanup()
    mountIcon({ activePanelId: 'explorer' })
    expect(screen.getByRole('button', { name: '资源管理器' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('selects its own panel on click (the shell expands from the rail itself)', () => {
    const b = mountIcon()
    fireEvent.click(screen.getByRole('button', { name: '资源管理器' }))
    expect(b.selectPanel).toHaveBeenCalledWith('explorer')
  })

  it('renders on the collapsed rail with the same behavior', () => {
    const b = mountIcon({ wide: false, activePanelId: 'explorer' })
    const button = screen.getByRole('button', { name: '资源管理器' })
    expect(button.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(button)
    expect(b.selectPanel).toHaveBeenCalledWith('explorer')
  })
})
