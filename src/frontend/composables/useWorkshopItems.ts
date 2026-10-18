/**
 * Overview: Handles workshop item list state, filtering, and selection behavior in the renderer.
 * Responsibility: Loads items from IPC, applies app/visibility filters, 
 * tracks selection, and exposes open/refresh actions with status updates.
 */
import { computed, ref, watch } from 'vue'
import type { WorkshopItemSummary, WorkshopVisibilityFilter } from '@shared/contracts'

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

/** Provides Workshop list, filter, paging, selection, and refresh state to the renderer. */
export function useWorkshopItems(options: UseWorkshopItemsOptions) {
  const workshopFilterAppId = ref('')
  const workshopVisibilityFilter = ref<WorkshopVisibilityFilter>('all')
  const workshopItems = ref<WorkshopItemSummary[]>([])
  const selectedWorkshopItemId = ref('')
  const workshopListMessage = ref('')
  const hasWorkshopItemsError = ref(false)
  const workshopItemsPage = ref(1)
  const isLoadingWorkshopItems = ref(false)
  const hasNextWorkshopItemsPage = ref(false)
  const workshopItemsTotalCount = ref(0)
  let legacyWorkshopItems: WorkshopItemSummary[] | null = null
  let requestVersion = 0

  const selectedWorkshopItem = computed(() =>
    workshopItems.value.find((item) => item.publishedFileId === selectedWorkshopItemId.value)
  )
  const workshopFilterAppIdHasInvalidFormat = computed(() => {
    const value = workshopFilterAppId.value.trim()
    return value.length > 0 && !/^\d+$/.test(value)
  })

  const filteredWorkshopItems = computed(() => workshopItems.value)

  const workshopItemsTotalPages = computed(() =>
    Math.max(1, Math.ceil(workshopItemsTotalCount.value / WORKSHOP_ITEMS_PAGE_SIZE))
  )

  const paginatedWorkshopItems = computed(() => filteredWorkshopItems.value)

  const workshopItemsPageStart = computed(() =>
    filteredWorkshopItems.value.length === 0
      ? 0
      : (workshopItemsPage.value - 1) * WORKSHOP_ITEMS_PAGE_SIZE + 1
  )

  const workshopItemsPageEnd = computed(() =>
    workshopItemsPageStart.value + Math.max(0, filteredWorkshopItems.value.length - 1)
  )

  watch(workshopItemsTotalPages, (totalPages) => {
    if (workshopItemsPage.value > totalPages) {
      workshopItemsPage.value = totalPages
    }
  })

  /** Updates the App ID filter and returns paging to the first page. */
  function onChangeAppId(value: string): void {
    workshopFilterAppId.value = value
    workshopItemsPage.value = 1
  }

  /** Applies the visibility filter and reloads the active Workshop page. */
  function onChangeWorkshopVisibilityFilter(value: WorkshopVisibilityFilter): void {
    workshopVisibilityFilter.value = value
    workshopItemsPage.value = 1
    if (legacyWorkshopItems) {
      applyLegacyPage()
      return
    }
    if (options.canAccessMods()) void fetchWorkshopItems(false)
  }

  /** Clamps the requested page to available results and loads that page. */
  function goToWorkshopItemsPage(page: number): void {
    if (!Number.isFinite(page)) {
      return
    }
    const nextPage = Math.min(workshopItemsTotalPages.value, Math.max(1, Math.trunc(page)))
    if (nextPage === workshopItemsPage.value) return
    workshopItemsPage.value = nextPage
    if (legacyWorkshopItems) {
      applyLegacyPage()
      return
    }
    void fetchWorkshopItems(false)
  }

  /** Filters and slices the locally cached legacy item list for the active page. */
  function applyLegacyPage(): void {
    if (!legacyWorkshopItems) return
    const visibility = workshopVisibilityFilter.value
    const filtered = legacyWorkshopItems.filter((item) => {
      if (visibility === 'all') return true
      if (visibility === 'unknown') return item.visibility === undefined
      const expected = visibility === 'public' ? 0 : visibility === 'friends' ? 1 : visibility === 'hidden' ? 2 : 3
      return item.visibility === expected
    })
    workshopItemsTotalCount.value = filtered.length
    const start = (workshopItemsPage.value - 1) * WORKSHOP_ITEMS_PAGE_SIZE
    workshopItems.value = filtered.slice(start, start + WORKSHOP_ITEMS_PAGE_SIZE)
    hasNextWorkshopItemsPage.value = start + WORKSHOP_ITEMS_PAGE_SIZE < filtered.length
  }

  /** Updates the current Workshop selection and hydrates its update draft when needed. */
  function selectWorkshopItem(item: WorkshopItemSummary): void {
    selectedWorkshopItemId.value = item.publishedFileId
    options.onSelectWorkshopItem(item)
  }

  /** Synchronizes selection with its latest source state. */
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

  /** Loads the requested account page and updates paging, selection, and error state. */
  async function fetchWorkshopItems(refreshSelection: boolean): Promise<void> {
    if (!options.canAccessMods()) {
      options.setStatusMessage('Login first to load workshop items.')
      return
    }
    if (workshopFilterAppIdHasInvalidFormat.value) {
      hasWorkshopItemsError.value = true
      workshopListMessage.value = 'Workshop App ID filter must contain digits only.'
      options.setStatusMessage(workshopListMessage.value)
      return
    }

    const version = ++requestVersion
    const selectedId = selectedWorkshopItemId.value
    isLoadingWorkshopItems.value = true
    try {
      const pagedApi = window.workshop.getMyWorkshopItemsPage
      const result = typeof pagedApi === 'function'
        ? await pagedApi({
            appId: workshopFilterAppId.value.trim() || undefined,
            page: workshopItemsPage.value,
            pageSize: WORKSHOP_ITEMS_PAGE_SIZE,
            visibility: workshopVisibilityFilter.value
          })
        : null
      const legacyItems = result ? null : await window.workshop.getMyWorkshopItems({ appId: workshopFilterAppId.value.trim() || undefined })
      if (version !== requestVersion || !options.canAccessMods()) return
      legacyWorkshopItems = legacyItems
      if (legacyItems) {
        applyLegacyPage()
      } else if (result) {
        workshopItems.value = result.items
        workshopItemsPage.value = result.page
        hasNextWorkshopItemsPage.value = result.hasNext
        workshopItemsTotalCount.value = result.totalItems ?? ((result.page - 1) * result.pageSize + result.items.length + (result.hasNext ? 1 : 0))
      }
      const items = workshopItems.value
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

  /** Loads Workshop items from its configured source. */
  async function loadWorkshopItems(): Promise<void> {
    await fetchWorkshopItems(false)
  }

  /** Restores app ID filter to its initial state. */
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

  /** Opens selected Workshop item and updates related UI state. */
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

  /** Refreshes the current page and reconciles the selected Workshop item. */
  async function refreshSelectedWorkshopItem(): Promise<void> {
    await fetchWorkshopItems(true)
  }

  /** Clears the current Workshop list, selection, filters, and paging state. */
  function resetWorkshopState(): void {
    requestVersion += 1
    isLoadingWorkshopItems.value = false
    workshopFilterAppId.value = ''
    workshopVisibilityFilter.value = 'all'
    workshopItems.value = []
    hasNextWorkshopItemsPage.value = false
    workshopItemsTotalCount.value = 0
    legacyWorkshopItems = null
    workshopItemsPage.value = 1
    selectedWorkshopItemId.value = ''
    workshopListMessage.value = ''
    hasWorkshopItemsError.value = false
  }

  return {
    workshopFilterAppId,
    workshopVisibilityFilter,
    workshopItems,
    workshopItemsTotalCount,
    workshopFilterAppIdHasInvalidFormat,
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
