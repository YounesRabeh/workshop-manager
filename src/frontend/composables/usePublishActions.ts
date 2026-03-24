/**
 * Overview: Encapsulates create/update/visibility publish command flows for workshop items.
 * Responsibility: Builds payloads, enforces action preconditions, 
 * coordinates IPC requests, and updates UI-facing publish/visibility state with user feedback.
 */
import { computed, ref, type ComputedRef, type Ref } from 'vue'
import type { UploadDraft, WorkshopItemSummary } from '@shared/contracts'
import type { UploadDraftState } from '../types/ui'

interface ApiFailure {
  message: string
  code: string
}

interface ToastInput {
  tone: 'success' | 'error' | 'warning' | 'info'
  title: string
  detail: string
}

interface RequirementsResult {
  valid: boolean
  appId: boolean
  title: boolean
  publishedFileId?: boolean
  contentFolder?: boolean
}

interface UsePublishActionsOptions {
  loginState: Ref<'signed_out' | 'signed_in'>
  selectedWorkshopItemId: Ref<string>
  selectedWorkshopItem: ComputedRef<WorkshopItemSummary | undefined>
  workshopItems: Ref<WorkshopItemSummary[]>
  workshopFilterAppId: Ref<string>
  createDraft: UploadDraftState
  updateDraft: UploadDraftState
  createRequirements: ComputedRef<RequirementsResult>
  updateRequirements: ComputedRef<RequirementsResult>
  hasPendingUpdateChanges: ComputedRef<boolean>
  updateTagsTouched: Ref<boolean>
  updateDraftCache: Ref<Record<string, UploadDraftState>>
  normalizeError: (error: unknown) => ApiFailure
  setStatusMessage: (message: string) => void
  showToast: (toast: ToastInput) => void
  onSelectWorkshopItem: (item: WorkshopItemSummary) => void
}

function visibilityLabel(value: 0 | 1 | 2 | 3): string {
  if (value === 0) {
    return 'Public'
  }
  if (value === 1) {
    return 'Friends-only'
  }
  if (value === 2) {
    return 'Hidden'
  }
  return 'Unlisted'
}

function actionFailureTitle(operation: 'upload' | 'update' | 'visibility'): string {
  if (operation === 'upload') {
    return 'Upload Failed'
  }
  if (operation === 'update') {
    return 'Update Failed'
  }
  return 'Visibility Update Failed'
}

function actionFailureStatus(operation: 'upload' | 'update' | 'visibility'): string {
  if (operation === 'upload') {
    return 'Upload failed. See popup.'
  }
  if (operation === 'update') {
    return 'Update failed. See popup.'
  }
  return 'Visibility update failed. See popup.'
}

function buildUploadDraft(
  source: UploadDraftState,
  mode: 'update' | 'create',
  updateTagsTouched: boolean,
  visibility?: 0 | 1 | 2 | 3
): UploadDraft {
  const normalizedReleaseNote = source.releaseNotes.replace(/\r\n/g, '\n').trim()

  return {
    appId: source.appId,
    publishedFileId: mode === 'update' ? source.publishedFileId || undefined : undefined,
    contentFolder: source.contentFolder,
    previewFile: source.previewFile,
    title: source.title,
    changenote: normalizedReleaseNote.length > 0 ? normalizedReleaseNote : undefined,
    tags: [...source.tags],
    forceTagsUpdate: mode === 'update' ? updateTagsTouched : undefined,
    visibility
  }
}

export function usePublishActions(options: UsePublishActionsOptions) {
  const committedVisibility = ref<0 | 1 | 2 | 3>(0)
  const pendingVisibility = ref<0 | 1 | 2 | 3>(0)
  const createVisibility = ref<0 | 1 | 2 | 3>(2)
  const isUpdateConfirmOpen = ref(false)
  const isCreateConfirmOpen = ref(false)

  const selectedUpdateAppId = computed(() => {
    const fromItem = options.selectedWorkshopItem.value?.appId?.trim()
    if (fromItem) {
      return fromItem
    }
    return options.updateDraft.appId.trim()
  })

  const canChangeVisibility = computed(() => {
    return (
      options.loginState.value === 'signed_in' &&
      options.selectedWorkshopItemId.value.trim().length > 0 &&
      selectedUpdateAppId.value.length > 0 &&
      pendingVisibility.value !== committedVisibility.value
    )
  })

  function setPendingVisibility(value: 0 | 1 | 2 | 3): void {
    pendingVisibility.value = value
  }

  function setCreateVisibility(value: 0 | 1 | 2 | 3): void {
    createVisibility.value = value
  }

  function setVisibilityFromSelection(value: 0 | 1 | 2 | 3): void {
    committedVisibility.value = value
    pendingVisibility.value = value
  }

  function canCreate(): boolean {
    return options.loginState.value === 'signed_in' && options.createRequirements.value.valid
  }

  function resolveCreateBlockedMessage(): string {
    if (options.loginState.value !== 'signed_in') {
      return 'Create blocked: login required.'
    }
    if (
      !options.createRequirements.value.appId ||
      !options.createRequirements.value.contentFolder ||
      !options.createRequirements.value.title
    ) {
      return 'Create blocked: app ID, content folder, and title are required.'
    }
    return 'Create blocked: requirements not met.'
  }

  function canUpdate(): boolean {
    return (
      options.loginState.value === 'signed_in' &&
      options.selectedWorkshopItemId.value.trim().length > 0 &&
      options.updateRequirements.value.valid &&
      options.hasPendingUpdateChanges.value
    )
  }

  function resolveUpdateBlockedMessage(): string {
    if (
      !options.updateRequirements.value.appId ||
      !options.updateRequirements.value.publishedFileId ||
      !options.updateRequirements.value.title
    ) {
      return 'Update blocked: title, app ID, and published file ID are required.'
    }
    if (!options.hasPendingUpdateChanges.value) {
      return 'Update blocked: no changes detected. Modify title/content/preview/tags/release notes first.'
    }
    return 'Update blocked: requirements not met.'
  }

  function handleActionFailure(operation: 'upload' | 'update' | 'visibility', error: unknown): void {
    const parsed = options.normalizeError(error)
    options.setStatusMessage(actionFailureStatus(operation))
    options.showToast({
      tone: 'error',
      title: actionFailureTitle(operation),
      detail: parsed.message
    })
  }

  async function upload(): Promise<void> {
    if (!canCreate()) {
      options.setStatusMessage(resolveCreateBlockedMessage())
      return
    }

    try {
      const result = (await window.workshop.uploadMod({
        profileId: 'new-item',
        draft: buildUploadDraft(options.createDraft, 'create', options.updateTagsTouched.value, createVisibility.value)
      })) as { publishedFileId?: string }

      options.setStatusMessage('Upload completed successfully.')
      options.showToast({
        tone: 'success',
        title: 'Upload Completed',
        detail: result.publishedFileId
          ? `Published File ID: ${result.publishedFileId}`
          : 'Workshop item upload finished successfully.'
      })

      try {
        const refreshedItems = await window.workshop.getMyWorkshopItems({
          appId: options.workshopFilterAppId.value || undefined
        })
        options.workshopItems.value = refreshedItems
        options.setStatusMessage('Upload completed successfully. Mod list refreshed.')
      } catch (refreshError) {
        const parsed = options.normalizeError(refreshError)
        options.setStatusMessage(`Upload completed, but mod list refresh failed (${parsed.code}): ${parsed.message}`)
      }
    } catch (error) {
      handleActionFailure('upload', error)
    }
  }

  function openCreateConfirmation(): void {
    if (!canCreate()) {
      options.setStatusMessage(resolveCreateBlockedMessage())
      return
    }
    isCreateConfirmOpen.value = true
  }

  function closeCreateConfirmation(): void {
    isCreateConfirmOpen.value = false
  }

  async function confirmCreateItem(): Promise<void> {
    isCreateConfirmOpen.value = false
    await upload()
  }

  async function updateItem(): Promise<void> {
    if (!canUpdate()) {
      options.setStatusMessage(resolveUpdateBlockedMessage())
      return
    }

    const updatedItemId =
      options.selectedWorkshopItemId.value.trim() || options.updateDraft.publishedFileId.trim()

    try {
      const result = (await window.workshop.updateMod({
        profileId: options.selectedWorkshopItemId.value || options.updateDraft.publishedFileId,
        draft: buildUploadDraft(options.updateDraft, 'update', options.updateTagsTouched.value, pendingVisibility.value)
      })) as { publishedFileId?: string }

      committedVisibility.value = pendingVisibility.value
      options.workshopItems.value = options.workshopItems.value.map((item) =>
        item.publishedFileId === options.selectedWorkshopItemId.value
          ? { ...item, visibility: committedVisibility.value }
          : item
      )
      options.showToast({
        tone: 'success',
        title: 'Update Completed',
        detail: result.publishedFileId
          ? `Updated item ID: ${result.publishedFileId}`
          : 'Workshop item update finished successfully.'
      })
      if (updatedItemId) {
        delete options.updateDraftCache.value[updatedItemId]
      }

      try {
        const refreshedItems = await window.workshop.getMyWorkshopItems({
          appId: options.workshopFilterAppId.value || undefined
        })
        options.workshopItems.value = refreshedItems

        const refreshedItem = updatedItemId
          ? refreshedItems.find((item) => item.publishedFileId === updatedItemId)
          : undefined
        if (refreshedItem) {
          options.onSelectWorkshopItem(refreshedItem)
        }
        options.setStatusMessage('Update completed successfully. Update page refreshed.')
      } catch (refreshError) {
        const parsed = options.normalizeError(refreshError)
        options.setStatusMessage(`Update completed, but refresh failed (${parsed.code}): ${parsed.message}`)
      }
    } catch (error) {
      handleActionFailure('update', error)
    }
  }

  function openUpdateConfirmation(): void {
    if (!canUpdate()) {
      options.setStatusMessage(resolveUpdateBlockedMessage())
      return
    }
    isUpdateConfirmOpen.value = true
  }

  function closeUpdateConfirmation(): void {
    isUpdateConfirmOpen.value = false
  }

  async function confirmUpdateItem(): Promise<void> {
    isUpdateConfirmOpen.value = false
    await updateItem()
  }

  async function updateVisibilityOnly(): Promise<void> {
    if (!canChangeVisibility.value) {
      options.setStatusMessage('Select a different visibility first.')
      return
    }

    const appId = selectedUpdateAppId.value
    const publishedFileId = options.selectedWorkshopItemId.value.trim()
    const targetVisibility = pendingVisibility.value

    try {
      const result = await window.workshop.updateVisibility({
        appId,
        publishedFileId,
        visibility: targetVisibility
      })

      committedVisibility.value = targetVisibility
      options.workshopItems.value = options.workshopItems.value.map((item) =>
        item.publishedFileId === publishedFileId
          ? { ...item, visibility: targetVisibility }
          : item
      )
      options.setStatusMessage(`Visibility updated to ${visibilityLabel(targetVisibility)}: ${JSON.stringify(result)}`)
      options.showToast({
        tone: 'success',
        title: 'Visibility Updated',
        detail: `Changed to ${visibilityLabel(targetVisibility)}.`
      })
    } catch (error) {
      handleActionFailure('visibility', error)
    }
  }

  return {
    committedVisibility,
    pendingVisibility,
    createVisibility,
    isUpdateConfirmOpen,
    isCreateConfirmOpen,
    selectedUpdateAppId,
    canChangeVisibility,
    visibilityLabel,
    setPendingVisibility,
    setCreateVisibility,
    setVisibilityFromSelection,
    canCreate,
    canUpdate,
    openCreateConfirmation,
    closeCreateConfirmation,
    confirmCreateItem,
    openUpdateConfirmation,
    closeUpdateConfirmation,
    confirmUpdateItem,
    updateVisibilityOnly
  }
}
