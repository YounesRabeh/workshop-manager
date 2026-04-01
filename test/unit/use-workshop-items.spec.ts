/** @vitest-environment jsdom */

import { describe, expect, it, vi, beforeEach } from 'vitest'
import { useWorkshopItems } from '../../src/frontend/composables/useWorkshopItems'

describe('useWorkshopItems composable', () => {
  const workshop = {
    getMyWorkshopItems: vi.fn(async () => [
      { publishedFileId: '1', title: 'Item One', appId: '480', visibility: 0 }
    ]),
    openExternal: vi.fn(async () => ({ ok: true }))
  }

  beforeEach(() => {
    vi.clearAllMocks()
    ;(window as unknown as { workshop: typeof workshop }).workshop = workshop
  })

  it('blocks loading when not authenticated', async () => {
    const statuses: string[] = []
    const store = useWorkshopItems({
      canAccessMods: () => false,
      normalizeError: () => ({ code: 'auth', message: 'auth' }),
      setStatusMessage: (message) => {
        statuses.push(message)
      },
      onSelectWorkshopItem: () => undefined
    })

    await store.loadWorkshopItems()

    expect(workshop.getMyWorkshopItems).not.toHaveBeenCalled()
    expect(statuses.at(-1)).toBe('Login first to load workshop items.')
  })

  it('loads items and reports status message', async () => {
    const statuses: string[] = []
    const store = useWorkshopItems({
      canAccessMods: () => true,
      normalizeError: () => ({ code: 'command_failed', message: 'failed' }),
      setStatusMessage: (message) => {
        statuses.push(message)
      },
      onSelectWorkshopItem: () => undefined
    })

    await store.loadWorkshopItems()

    expect(store.workshopItems.value).toHaveLength(1)
    expect(statuses.at(-1)).toBe('Loaded 1 workshop item(s).')
  })

  it('keeps selection and rehydrates callback on refresh', async () => {
    const onSelectWorkshopItem = vi.fn()
    const store = useWorkshopItems({
      canAccessMods: () => true,
      normalizeError: () => ({ code: 'command_failed', message: 'failed' }),
      setStatusMessage: () => undefined,
      onSelectWorkshopItem
    })

    await store.loadWorkshopItems()
    store.selectWorkshopItem(store.workshopItems.value[0]!)
    await store.refreshSelectedWorkshopItem()

    expect(onSelectWorkshopItem).toHaveBeenCalledTimes(2)
    expect(store.selectedWorkshopItemId.value).toBe('1')
  })

  it('stores an explicit error message instead of falling back to the empty-state copy', async () => {
    workshop.getMyWorkshopItems.mockRejectedValueOnce(
      new Error('[auth] Signed in to Steam, but account identity could not be resolved on this platform.')
    )

    const statuses: string[] = []
    const store = useWorkshopItems({
      canAccessMods: () => true,
      normalizeError: (error) => ({
        code: 'auth',
        message:
          error instanceof Error
            ? error.message.replace(/^\[auth\]\s*/i, '')
            : 'unexpected'
      }),
      setStatusMessage: (message) => {
        statuses.push(message)
      },
      onSelectWorkshopItem: () => undefined
    })

    await store.loadWorkshopItems()

    expect(store.hasWorkshopItemsError.value).toBe(true)
    expect(store.workshopListMessage.value).toContain('Workshop list failed (auth)')
    expect(statuses.at(-1)).toContain('account identity could not be resolved')
  })
})
