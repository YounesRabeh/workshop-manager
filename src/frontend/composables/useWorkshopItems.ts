/**
 * Overview: Handles workshop item list state, filtering, and selection behavior in the renderer.
 * Responsibility: Loads items from IPC, applies app/visibility filters, 
 * tracks selection, and exposes open/refresh actions with status updates.
 */
import { computed, ref } from 'vue'
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

export function useWorkshopItems(options: UseWorkshopItemsOptions) {
  const workshopFilterAppId = ref('')
  const workshopVisibilityFilter = ref<WorkshopVisibilityFilter>('all')
  const workshopItems = ref<WorkshopItemSummary[]>([])
  const selectedWorkshopItemId = ref('')
  const workshopListMessage = ref('')
  const hasWorkshopItemsError = ref(false)

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

  function onChangeAppId(value: string): void {
    workshopFilterAppId.value = value
  }

  function onChangeWorkshopVisibilityFilter(value: WorkshopVisibilityFilter): void {
    workshopVisibilityFilter.value = value
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

  async function loadWorkshopItems(): Promise<void> {
    if (!options.canAccessMods()) {
      options.setStatusMessage('Login first to load workshop items.')
      return
    }

    try {
      const items = await window.workshop.getMyWorkshopItems({ appId: workshopFilterAppId.value || undefined })
      workshopItems.value = items
      reconcileSelection(items)
      hasWorkshopItemsError.value = false
      if (items.length === 0) {
        workshopListMessage.value = 'No workshop items found for this account/filter.'
        options.setStatusMessage(workshopListMessage.value)
        return
      }
      workshopListMessage.value = ''
      options.setStatusMessage(`Loaded ${items.length} workshop item(s).`)
    } catch (error) {
      const parsed = options.normalizeError(error)
      hasWorkshopItemsError.value = true
      workshopListMessage.value = `Workshop list failed (${parsed.code}): ${parsed.message}`
      options.setStatusMessage(workshopListMessage.value)
    }
  }

  async function resetAppIdFilter(): Promise<void> {
    if (workshopFilterAppId.value.trim().length === 0) {
      return
    }

    workshopFilterAppId.value = ''
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
    if (!options.canAccessMods()) {
      options.setStatusMessage('Login first to load workshop items.')
      return
    }

    const currentSelectedId = selectedWorkshopItemId.value.trim()

    try {
      const items = await window.workshop.getMyWorkshopItems({ appId: workshopFilterAppId.value || undefined })
      workshopItems.value = items
      reconcileSelection(items)
      hasWorkshopItemsError.value = false

      if (currentSelectedId) {
        const refreshedItem = items.find((item) => item.publishedFileId === currentSelectedId)
        if (refreshedItem) {
          selectWorkshopItem(refreshedItem)
          workshopListMessage.value = ''
          options.setStatusMessage('Workshop item refreshed.')
          return
        }
      }

      if (items.length === 0) {
        workshopListMessage.value = 'No workshop items found for this account/filter.'
        options.setStatusMessage(workshopListMessage.value)
        return
      }
      workshopListMessage.value = ''
      options.setStatusMessage(`Loaded ${items.length} workshop item(s).`)
    } catch (error) {
      const parsed = options.normalizeError(error)
      hasWorkshopItemsError.value = true
      workshopListMessage.value = `Workshop refresh failed (${parsed.code}): ${parsed.message}`
      options.setStatusMessage(workshopListMessage.value)
    }
  }

  return {
    workshopFilterAppId,
    workshopVisibilityFilter,
    workshopItems,
    selectedWorkshopItemId,
    workshopListMessage,
    hasWorkshopItemsError,
    selectedWorkshopItem,
    filteredWorkshopItems,
    onChangeAppId,
    onChangeWorkshopVisibilityFilter,
    selectWorkshopItem,
    loadWorkshopItems,
    resetAppIdFilter,
    openSelectedWorkshopItem,
    refreshSelectedWorkshopItem
  }
}
