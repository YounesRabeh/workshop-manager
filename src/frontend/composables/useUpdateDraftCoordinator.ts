/**
 * Overview: Coordinates update-flow selection, draft hydration, and cached edit state.
 * Responsibility: Hydrates the update draft from the selected workshop item,
 * reconciles selection after list refreshes, and exposes derived update-change state.
 */
import { computed, watch, type ComputedRef, type Ref } from 'vue'
import type { WorkshopItemSummary } from '@shared/contracts'
import type { FlowStep, UploadDraftState } from '../types/ui'
import { applyDraft, cloneDraft, createEmptyDraft } from './useDrafts'

interface UseUpdateDraftCoordinatorOptions {
  flowStep: Ref<FlowStep>
  selectedWorkshopItemId: Ref<string>
  selectedWorkshopItem: ComputedRef<WorkshopItemSummary | undefined>
  workshopItems: Ref<WorkshopItemSummary[]>
  updateDraft: UploadDraftState
  updateDraftCache: Ref<Record<string, UploadDraftState>>
  isHydratingUpdateDraft: Ref<boolean>
  setVisibilityFromSelection: (value: 0 | 1 | 2 | 3) => void
  setStatusMessage: (message: string) => void
}

function normalizeComparableTitle(value: string | undefined): string {
  if (typeof value !== 'string') {
    return ''
  }

  return value.replace(/\s+/g, ' ').trim().toLocaleLowerCase()
}

export function useUpdateDraftCoordinator(options: UseUpdateDraftCoordinatorOptions) {
  const hasMeaningfulUpdateTitleChange = computed(() => {
    const selectedTitle = normalizeComparableTitle(options.selectedWorkshopItem.value?.title)
    const draftTitle = normalizeComparableTitle(options.updateDraft.title)
    if (!selectedTitle || !draftTitle) {
      return false
    }

    return selectedTitle !== draftTitle
  })

  const hasPendingUpdateChanges = computed(() => {
    const selectedItem = options.selectedWorkshopItem.value
    if (!selectedItem) {
      return false
    }

    const contentFolderChanged = options.updateDraft.contentFolder.trim().length > 0
    const previewChanged = options.updateDraft.previewFile.trim().length > 0
    const releaseNotesChanged = options.updateDraft.releaseNotes.trim().length > 0
    const titleChanged = hasMeaningfulUpdateTitleChange.value

    const appIdChanged =
      options.updateDraft.appId.trim() !== (selectedItem.appId?.trim() ?? '')
    const publishedFileIdChanged =
      options.updateDraft.publishedFileId.trim() !== selectedItem.publishedFileId.trim()

    return (
      contentFolderChanged ||
      previewChanged ||
      releaseNotesChanged ||
      titleChanged ||
      appIdChanged ||
      publishedFileIdChanged
    )
  })

  function hydrateSelectedWorkshopItem(
    item: WorkshopItemSummary,
    config: { navigateToUpdate?: boolean } = {}
  ): void {
    options.selectedWorkshopItemId.value = item.publishedFileId
    const cachedDraft = options.updateDraftCache.value[item.publishedFileId]
    const visibility = item.visibility ?? 0

    options.isHydratingUpdateDraft.value = true
    if (cachedDraft) {
      applyDraft(options.updateDraft, cachedDraft)
    } else {
      applyDraft(options.updateDraft, {
        ...createEmptyDraft(),
        appId: item.appId ?? '',
        publishedFileId: item.publishedFileId,
        title: item.title
      })
    }
    options.isHydratingUpdateDraft.value = false

    options.setVisibilityFromSelection(visibility)
    options.setStatusMessage(`Loaded workshop item: ${item.title}`)
    if (config.navigateToUpdate !== false) {
      options.flowStep.value = 'update'
    }
  }

  function reconcileWorkshopSelection(): void {
    const selectedId = options.selectedWorkshopItemId.value.trim()
    const hasCurrentSelection =
      selectedId.length > 0 &&
      options.workshopItems.value.some((item) => item.publishedFileId === selectedId)

    if (hasCurrentSelection) {
      return
    }

    if (selectedId.length > 0) {
      options.selectedWorkshopItemId.value = ''
    }

    if (options.workshopItems.value.length > 0) {
      hydrateSelectedWorkshopItem(options.workshopItems.value[0], { navigateToUpdate: false })
      return
    }

    if (options.flowStep.value === 'update') {
      options.flowStep.value = 'mods'
    }
  }

  watch(
    options.updateDraft,
    () => {
      if (options.isHydratingUpdateDraft.value) {
        return
      }

      const itemId = options.selectedWorkshopItemId.value.trim()
      if (!itemId) {
        return
      }

      options.updateDraftCache.value[itemId] = cloneDraft(options.updateDraft)
    },
    { deep: true }
  )

  return {
    hasMeaningfulUpdateTitleChange,
    hasPendingUpdateChanges,
    hydrateSelectedWorkshopItem,
    reconcileWorkshopSelection
  }
}
