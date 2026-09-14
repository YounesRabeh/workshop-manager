/**
 * Overview: Handles workshop item list state, filtering, and selection behavior in the renderer.
 * Responsibility: Loads items from IPC, applies app/visibility filters, 
 * tracks selection, and exposes open/refresh actions with status updates.
 */
import { computed, ref, watch } from 'vue'
import type { WorkshopItemSummary } from '@shared/contracts'
import type { WorkshopVisibilityFilter } from '../types/ui'

interface ApiFailure {
  message: string
  code: string
}

interface UseWorkshopItemsOptions {
  canAccessMods: () => boolean
  normalizeError: (error: unknown) => ApiFailure
  setStatusMessage: (message: string) => void
  onSelectWorkshopItem: (item: WorkshopItemSummary) => void
}

const WORKSHOP_ITEMS_PAGE_SIZE = 12

export function useWorkshopItems(options: UseWorkshopItemsOptions) {
  const workshopFilterAppId = ref('')
  const workshopVisibilityFilter = ref<WorkshopVisibilityFilter>('all')
  const workshopItems = ref<WorkshopItemSummary[]>([])
  const selectedWorkshopItemId = ref('')
  const workshopListMessage = ref('')
  const hasWorkshopItemsError = ref(false)
  const workshopItemsPage = ref(1)
  const isLoadingWorkshopItems = ref(false)
  let requestVersion = 0

  const selectedWorkshopItem = computed(() =>
    workshopItems.value.find((item) => item.publishedFileId === selectedWorkshopItemId.value)
  )

  const filteredWorkshopItems = computed(() => {
    if (workshopVisibilityFilter.value === 'all') {
      return workshopItems.value
    }

    return workshopItems.value.filter((item) => {
      if (workshopVisibilityFilter.value === 'public') {
        return item.visibility === 0
      }
      if (workshopVisibilityFilter.value === 'friends') {
        return item.visibility === 1
      }
      if (workshopVisibilityFilter.value === 'hidden') {
        return item.visibility === 2
      }
      if (workshopVisibilityFilter.value === 'unlisted') {
        return item.visibility === 3
      }
      return typeof item.visibility === 'undefined'
    })
  })

  const workshopItemsTotalPages = computed(() =>
    Math.max(1, Math.ceil(filteredWorkshopItems.value.length / WORKSHOP_ITEMS_PAGE_SIZE))
  )

  const paginatedWorkshopItems = computed(() => {
    const startIndex = (workshopItemsPage.value - 1) * WORKSHOP_ITEMS_PAGE_SIZE
    return filteredWorkshopItems.value.slice(startIndex, startIndex + WORKSHOP_ITEMS_PAGE_SIZE)
  })

  const workshopItemsPageStart = computed(() =>
    filteredWorkshopItems.value.length === 0
      ? 0
      : (workshopItemsPage.value - 1) * WORKSHOP_ITEMS_PAGE_SIZE + 1
  )

  const workshopItemsPageEnd = computed(() =>
    Math.min(workshopItemsPage.value * WORKSHOP_ITEMS_PAGE_SIZE, filteredWorkshopItems.value.length)
  )

  watch(workshopItemsTotalPages, (totalPages) => {
    if (workshopItemsPage.value > totalPages) {
      workshopItemsPage.value = totalPages
    }
  })

  function onChangeAppId(value: string): void {
    workshopFilterAppId.value = value
    workshopItemsPage.value = 1
  }

  function onChangeWorkshopVisibilityFilter(value: WorkshopVisibilityFilter): void {
    workshopVisibilityFilter.value = value
    workshopItemsPage.value = 1
  }

  function goToWorkshopItemsPage(page: number): void {
    if (!Number.isFinite(page)) {
      return
    }
    workshopItemsPage.value = Math.min(
      workshopItemsTotalPages.value,
      Math.max(1, Math.trunc(page))
    )
  }

  function selectWorkshopItem(item: WorkshopItemSummary): void {
    selectedWorkshopItemId.value = item.publishedFileId
    options.onSelectWorkshopItem(item)
  }

  function reconcileSelection(items: WorkshopItemSummary[]): void {
    const selectedId = selectedWorkshopItemId.value.trim()
    if (!selectedId) {
      return
    }

    const selectionStillExists = items.some((item) => item.publishedFileId === selectedId)
    if (!selectionStillExists) {
      selectedWorkshopItemId.value = ''
    }
  }

  async function fetchWorkshopItems(refreshSelection: boolean): Promise<void> {
    if (!options.canAccessMods()) {
      options.setStatusMessage('Login first to load workshop items.')
      return
    }

    const version = ++requestVersion
    const selectedId = selectedWorkshopItemId.value
    isLoadingWorkshopItems.value = true
    try {
      const items = await window.workshop.getMyWorkshopItems({ appId: workshopFilterAppId.value.trim() || undefined })
      if (version !== requestVersion || !options.canAccessMods()) return
      workshopItems.value = items
      if (!refreshSelection) workshopItemsPage.value = 1
      reconcileSelection(items)
      hasWorkshopItemsError.value = false
      const refreshedItem = refreshSelection && selectedWorkshopItemId.value === selectedId
        ? items.find((item) => item.publishedFileId === selectedId)
        : undefined
      if (refreshedItem) {
        selectWorkshopItem(refreshedItem)
        workshopListMessage.value = ''
        options.setStatusMessage('Workshop item refreshed.')
        return
      }
      if (items.length === 0) {
        workshopListMessage.value = 'No workshop items found for this account/filter.'
        options.setStatusMessage(workshopListMessage.value)
        return
      }
      workshopListMessage.value = ''
      options.setStatusMessage(`Loaded ${items.length} workshop item(s).`)
    } catch (error) {
      if (version !== requestVersion || !options.canAccessMods()) return
      const parsed = options.normalizeError(error)
      hasWorkshopItemsError.value = true
      workshopListMessage.value = `Workshop ${refreshSelection ? 'refresh' : 'list'} failed (${parsed.code}): ${parsed.message}`
      options.setStatusMessage(workshopListMessage.value)
    } finally {
      if (version === requestVersion) isLoadingWorkshopItems.value = false
    }
  }

  async function loadWorkshopItems(): Promise<void> {
    await fetchWorkshopItems(false)
  }

  async function resetAppIdFilter(): Promise<void> {
    if (workshopFilterAppId.value.trim().length === 0) {
      return
    }

    workshopFilterAppId.value = ''
    workshopItemsPage.value = 1
    if (options.canAccessMods()) {
      await loadWorkshopItems()
      return
    }
    options.setStatusMessage('App ID filter cleared.')
  }

  async function openSelectedWorkshopItem(): Promise<void> {
    const publishedFileId = selectedWorkshopItemId.value.trim()
    if (!publishedFileId) {
      options.setStatusMessage('Select a workshop item first.')
      return
    }

    const workshopUrl = `https://steamcommunity.com/sharedfiles/filedetails/?id=${encodeURIComponent(publishedFileId)}`
    try {
      const result = await window.workshop.openExternal({ url: workshopUrl })
      if (result.error) {
        options.setStatusMessage(`Could not open workshop page: ${result.error}`)
        return
      }
      options.setStatusMessage('Opened workshop page in your browser.')
    } catch (error) {
      const parsed = options.normalizeError(error)
      options.setStatusMessage(`Open workshop page failed (${parsed.code}): ${parsed.message}`)
    }
  }

  async function refreshSelectedWorkshopItem(): Promise<void> {
    await fetchWorkshopItems(true)
  }

  function resetWorkshopState(): void {
    requestVersion += 1
    isLoadingWorkshopItems.value = false
    workshopFilterAppId.value = ''
    workshopVisibilityFilter.value = 'all'
    workshopItems.value = []
    workshopItemsPage.value = 1
    selectedWorkshopItemId.value = ''
    workshopListMessage.value = ''
    hasWorkshopItemsError.value = false
  }

  return {
    workshopFilterAppId,
    workshopVisibilityFilter,
    workshopItems,
    selectedWorkshopItemId,
    workshopListMessage,
    hasWorkshopItemsError,
    isLoadingWorkshopItems,
    selectedWorkshopItem,
    filteredWorkshopItems,
    paginatedWorkshopItems,
    workshopItemsPage,
    workshopItemsTotalPages,
    workshopItemsPageStart,
    workshopItemsPageEnd,
    onChangeAppId,
    onChangeWorkshopVisibilityFilter,
    goToWorkshopItemsPage,
    selectWorkshopItem,
    loadWorkshopItems,
    resetAppIdFilter,
    openSelectedWorkshopItem,
    refreshSelectedWorkshopItem,
    resetWorkshopState
  }
}
