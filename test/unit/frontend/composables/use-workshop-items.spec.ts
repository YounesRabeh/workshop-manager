/** @vitest-environment jsdom */

import { describe, expect, it, vi, beforeEach } from 'vitest'
import { nextTick } from 'vue'
import { useWorkshopItems } from '@frontend/composables/useWorkshopItems'
import { TEST_WORKSHOP, createWorkshopItem } from '../../../fixtures/workshop-seed'

describe('useWorkshopItems composable', () => {
  const workshop = {
    getMyWorkshopItems: vi.fn(async () => [
      createWorkshopItem({ publishedFileId: '1', title: 'Item One' })
    ]),
    openExternal: vi.fn(async (): Promise<{ ok: true; error?: string }> => ({ ok: true }))
  }

  beforeEach(() => {
    vi.clearAllMocks()
    delete (workshop as typeof workshop & { getMyWorkshopItemsPage?: unknown }).getMyWorkshopItemsPage
    ;(window as unknown as { workshop: typeof workshop }).workshop = workshop
  })

  it('clears the App ID filter, reloads when signed in, and handles an already-empty filter', async () => {
    let signedIn = true
    const setStatusMessage = vi.fn()
    const store = useWorkshopItems({ canAccessMods: () => signedIn, normalizeError: () => ({ code: 'failed', message: 'failed' }), setStatusMessage, onSelectWorkshopItem: vi.fn() })
    await store.resetAppIdFilter()
    expect(workshop.getMyWorkshopItems).not.toHaveBeenCalled()
    store.onChangeAppId('480')
    await store.resetAppIdFilter()
    expect(store.workshopFilterAppId.value).toBe('')
    expect(workshop.getMyWorkshopItems).toHaveBeenCalledExactlyOnceWith({ appId: undefined })
    signedIn = false
    store.onChangeAppId('123')
    await store.resetAppIdFilter()
    expect(setStatusMessage).toHaveBeenLastCalledWith('App ID filter cleared.')
    store.onChangeWorkshopVisibilityFilter('friends')
    expect(workshop.getMyWorkshopItems).toHaveBeenCalledTimes(1)
  })

  it('opens the selected item with an encoded ID and reports browser failures', async () => {
    const setStatusMessage = vi.fn()
    const store = useWorkshopItems({ canAccessMods: () => true, normalizeError: () => ({ code: 'network', message: 'offline' }), setStatusMessage, onSelectWorkshopItem: vi.fn() })
    await store.openSelectedWorkshopItem()
    expect(setStatusMessage).toHaveBeenLastCalledWith('Select a workshop item first.')
    expect(workshop.openExternal).not.toHaveBeenCalled()
    store.selectedWorkshopItemId.value = '123&other=1'
    await store.openSelectedWorkshopItem()
    expect(workshop.openExternal).toHaveBeenCalledWith({ url: 'https://steamcommunity.com/sharedfiles/filedetails/?id=123%26other%3D1' })
    expect(setStatusMessage).toHaveBeenLastCalledWith('Opened workshop page in your browser.')
    workshop.openExternal.mockResolvedValueOnce({ ok: true, error: 'browser unavailable' })
    await store.openSelectedWorkshopItem()
    expect(setStatusMessage).toHaveBeenLastCalledWith('Could not open workshop page: browser unavailable')
    workshop.openExternal.mockRejectedValueOnce(new Error('offline'))
    await store.openSelectedWorkshopItem()
    expect(setStatusMessage).toHaveBeenLastCalledWith('Open workshop page failed (network): offline')
  })

  it.each([['public', 0], ['friends', 1], ['unlisted', 3], ['unknown', undefined]] as const)('filters legacy items by %s visibility', async (filter, visibility) => {
    workshop.getMyWorkshopItems.mockResolvedValueOnce([
      createWorkshopItem({ publishedFileId: 'wanted', title: 'Wanted', visibility }),
      createWorkshopItem({ publishedFileId: 'other', title: 'Other', visibility: 2 })
    ])
    const store = useWorkshopItems({ canAccessMods: () => true, normalizeError: () => ({ code: 'failed', message: 'failed' }), setStatusMessage: vi.fn(), onSelectWorkshopItem: vi.fn() })
    await store.loadWorkshopItems()
    store.onChangeWorkshopVisibilityFilter(filter)
    expect(store.workshopItems.value.map(item => item.publishedFileId)).toEqual(['wanted'])
    store.goToWorkshopItemsPage(NaN)
    expect(store.workshopItemsPage.value).toBe(1)
    store.workshopItemsPage.value = 10
    store.workshopItemsTotalCount.value = 25
    await nextTick()
    expect(store.workshopItemsPage.value).toBe(3)
  })

  it('uses the production paged API and sends page, size, app, and visibility filters', async () => {
    const getMyWorkshopItemsPage = vi.fn()
      .mockResolvedValueOnce({
        items: Array.from({ length: 12 }, (_, index) => ({
          ...createWorkshopItem({ publishedFileId: String(index + 1), title: `Item ${index + 1}` })
        })),
        page: 1,
        pageSize: 12,
        totalItems: 13,
        hasNext: true
      })
      .mockResolvedValueOnce({
        items: [createWorkshopItem({ publishedFileId: '13', title: 'Item 13' })],
        page: 2,
        pageSize: 12,
        totalItems: 13,
        hasNext: false
      })
      .mockResolvedValueOnce({ items: [], page: 1, pageSize: 12, totalItems: 0, hasNext: false })
    ;(workshop as typeof workshop & { getMyWorkshopItemsPage: typeof getMyWorkshopItemsPage }).getMyWorkshopItemsPage = getMyWorkshopItemsPage
    const store = useWorkshopItems({
      canAccessMods: () => true,
      normalizeError: () => ({ code: 'command_failed', message: 'failed' }),
      setStatusMessage: () => undefined,
      onSelectWorkshopItem: () => undefined
    })
    store.onChangeAppId(TEST_WORKSHOP.appId)

    await store.loadWorkshopItems()
    expect(getMyWorkshopItemsPage).toHaveBeenNthCalledWith(1, {
      appId: TEST_WORKSHOP.appId, page: 1, pageSize: 12, visibility: 'all'
    })
    expect(workshop.getMyWorkshopItems).not.toHaveBeenCalled()
    expect(store.workshopItemsTotalPages.value).toBe(2)

    store.goToWorkshopItemsPage(2)
    await vi.waitFor(() => expect(store.workshopItems.value[0]?.publishedFileId).toBe('13'))
    expect(getMyWorkshopItemsPage).toHaveBeenNthCalledWith(2, {
      appId: TEST_WORKSHOP.appId, page: 2, pageSize: 12, visibility: 'all'
    })

    store.onChangeWorkshopVisibilityFilter('hidden')
    await vi.waitFor(() => expect(getMyWorkshopItemsPage).toHaveBeenCalledTimes(3))
    expect(getMyWorkshopItemsPage).toHaveBeenNthCalledWith(3, {
      appId: TEST_WORKSHOP.appId, page: 1, pageSize: 12, visibility: 'hidden'
    })
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

  it('blocks a non-numeric App ID filter before invoking IPC', async () => {
    const statuses: string[] = []
    const getMyWorkshopItemsPage = vi.fn()
    ;(workshop as typeof workshop & { getMyWorkshopItemsPage: typeof getMyWorkshopItemsPage }).getMyWorkshopItemsPage = getMyWorkshopItemsPage
    const store = useWorkshopItems({
      canAccessMods: () => true,
      normalizeError: () => ({ code: 'validation', message: 'invalid' }),
      setStatusMessage: (message) => statuses.push(message),
      onSelectWorkshopItem: () => undefined
    })

    store.onChangeAppId('left-4-dead')
    await store.loadWorkshopItems()

    expect(store.workshopFilterAppIdHasInvalidFormat.value).toBe(true)
    expect(getMyWorkshopItemsPage).not.toHaveBeenCalled()
    expect(workshop.getMyWorkshopItems).not.toHaveBeenCalled()
    expect(statuses.at(-1)).toBe('Workshop App ID filter must contain digits only.')
  })

  it('ignores older responses and responses arriving after sign-out', async () => {
    type Items = Awaited<ReturnType<typeof workshop.getMyWorkshopItems>>
    let resolveFirst!: (items: Items) => void
    workshop.getMyWorkshopItems.mockImplementationOnce(() => new Promise<Items>((resolve) => { resolveFirst = resolve }))
    const store = useWorkshopItems({
      canAccessMods: () => true,
      normalizeError: () => ({ code: 'command_failed', message: 'failed' }),
      setStatusMessage: () => undefined,
      onSelectWorkshopItem: () => undefined
    })
    const first = store.loadWorkshopItems()
    await store.loadWorkshopItems()
    resolveFirst([createWorkshopItem({ publishedFileId: 'old', title: 'Old' })])
    await first
    expect(store.workshopItems.value[0]?.publishedFileId).toBe('1')

    workshop.getMyWorkshopItems.mockImplementationOnce(() => new Promise<Items>((resolve) => { resolveFirst = resolve }))
    const pending = store.loadWorkshopItems()
    store.resetWorkshopState()
    resolveFirst([createWorkshopItem({ publishedFileId: 'old', title: 'Old' })])
    await pending
    expect(store.workshopItems.value).toEqual([])
    expect(store.isLoadingWorkshopItems.value).toBe(false)
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

  it('paginates fetched items and resets the page when filters change', async () => {
    workshop.getMyWorkshopItems.mockResolvedValueOnce(
      Array.from({ length: 25 }, (_, index) => ({
        publishedFileId: String(index + 1),
        title: `Item ${index + 1}`,
        appId: TEST_WORKSHOP.appId,
        visibility: index < 13 ? 0 : 2
      }))
    )
    const store = useWorkshopItems({
      canAccessMods: () => true,
      normalizeError: () => ({ code: 'command_failed', message: 'failed' }),
      setStatusMessage: () => undefined,
      onSelectWorkshopItem: () => undefined
    })

    await store.loadWorkshopItems()

    expect(store.paginatedWorkshopItems.value).toHaveLength(12)
    expect(store.workshopItemsTotalPages.value).toBe(3)
    expect(store.workshopItemsPageStart.value).toBe(1)
    expect(store.workshopItemsPageEnd.value).toBe(12)

    store.goToWorkshopItemsPage(2)
    expect(store.paginatedWorkshopItems.value[0]?.publishedFileId).toBe('13')
    expect(store.workshopItemsPageStart.value).toBe(13)
    expect(store.workshopItemsPageEnd.value).toBe(24)

    store.onChangeWorkshopVisibilityFilter('hidden')
    expect(store.workshopItemsPage.value).toBe(1)
    expect(store.filteredWorkshopItems.value).toHaveLength(12)
    expect(store.workshopItemsTotalPages.value).toBe(1)

    store.goToWorkshopItemsPage(99)
    expect(store.workshopItemsPage.value).toBe(1)
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

  it('clears stale selection when a reload no longer includes the selected item', async () => {
    const store = useWorkshopItems({
      canAccessMods: () => true,
      normalizeError: () => ({ code: 'command_failed', message: 'failed' }),
      setStatusMessage: () => undefined,
      onSelectWorkshopItem: () => undefined
    })

    await store.loadWorkshopItems()
    store.selectWorkshopItem(store.workshopItems.value[0]!)

    workshop.getMyWorkshopItems.mockResolvedValueOnce([])
    await store.loadWorkshopItems()

    expect(store.selectedWorkshopItemId.value).toBe('')
  })

  it('clears stale selection when refreshing a removed item', async () => {
    const store = useWorkshopItems({
      canAccessMods: () => true,
      normalizeError: () => ({ code: 'command_failed', message: 'failed' }),
      setStatusMessage: () => undefined,
      onSelectWorkshopItem: () => undefined
    })

    await store.loadWorkshopItems()
    store.selectWorkshopItem(store.workshopItems.value[0]!)

    workshop.getMyWorkshopItems.mockResolvedValueOnce([
      createWorkshopItem({ publishedFileId: '2', title: 'Item Two', visibility: 2 })
    ])
    await store.refreshSelectedWorkshopItem()

    expect(store.selectedWorkshopItemId.value).toBe('')
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
