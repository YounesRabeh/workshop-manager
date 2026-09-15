/** @vitest-environment jsdom */

import { computed, reactive, ref } from 'vue'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { usePublishActions } from '@frontend/composables/usePublishActions'
import type { StagedContentFile } from '@frontend/types/ui'
import { TEST_WORKSHOP, createWorkshopItem } from '../../../fixtures/workshop-seed'

describe('usePublishActions composable', () => {
  const workshop = {
    uploadMod: vi.fn(async () => ({ publishedFileId: '200' })),
    updateMod: vi.fn(async () => ({ publishedFileId: TEST_WORKSHOP.publishedFileId })),
    updateVisibility: vi.fn(async () => ({ ok: true })),
    getMyWorkshopItems: vi.fn(async () => [
      createWorkshopItem({ title: 'Updated', visibility: 2 })
    ])
  }

  beforeEach(() => {
    vi.clearAllMocks()
    ;(window as unknown as { workshop: typeof workshop }).workshop = workshop
  })

  function createHarness(options?: { hasPendingUpdateChanges?: boolean }) {
    const loginState = ref<'signed_out' | 'signed_in'>('signed_in')
    const selectedWorkshopItemId = ref<string>(TEST_WORKSHOP.publishedFileId)
    const workshopItems = ref([createWorkshopItem({ title: 'Item' })])
    const selectedWorkshopItem = computed(() =>
      workshopItems.value.find((item) => item.publishedFileId === selectedWorkshopItemId.value)
    )
    const workshopFilterAppId = ref('')
    const createDraft = reactive({
      appId: TEST_WORKSHOP.appId,
      publishedFileId: '',
      contentFolder: TEST_WORKSHOP.contentFolder,
      previewFile: '',
      title: 'Create Item',
      releaseNotes: ''
    })
    const updateDraft = reactive({
      appId: TEST_WORKSHOP.appId,
      publishedFileId: TEST_WORKSHOP.publishedFileId,
      contentFolder: TEST_WORKSHOP.contentFolder,
      previewFile: '',
      title: 'Update Item',
      releaseNotes: ''
    })
    const createStagedContentFiles = ref<StagedContentFile[]>([
      { absolutePath: '/mods/file.txt', relativePath: 'file.txt', sizeBytes: 10 }
    ])
    const updateStagedContentFiles = ref<StagedContentFile[]>([
      { absolutePath: '/mods/file.txt', relativePath: 'file.txt', sizeBytes: 10 }
    ])
    const createRequirements = computed(() => ({ valid: true, appId: true, contentFolder: true, title: true }))
    const updateRequirements = computed(() => ({ valid: true, appId: true, publishedFileId: true, title: true }))
    const updateDraftCache = ref<Record<string, typeof updateDraft>>({})
    const statuses: string[] = []
    const toasts: Array<{ title: string; tone: string }> = []

    const publish = usePublishActions({
      loginState,
      selectedWorkshopItemId,
      selectedWorkshopItem,
      workshopItems,
      workshopFilterAppId,
      createDraft,
      updateDraft,
      createStagedContentFiles,
      updateStagedContentFiles,
      createRequirements,
      updateRequirements,
      hasPendingUpdateChanges: () => options?.hasPendingUpdateChanges ?? true,
      updateDraftCache,
      setStatusMessage: (message) => {
        statuses.push(message)
      },
      showToast: (toast) => {
        toasts.push({ title: toast.title, tone: toast.tone })
      },
      onSelectWorkshopItem: (item) => {
        selectedWorkshopItemId.value = item.publishedFileId
      }
    })

    return {
      loginState,
      selectedWorkshopItemId,
      statuses,
      toasts,
      publish,
      workshopItems,
      createStagedContentFiles,
      updateStagedContentFiles
    }
  }

  it('blocks create confirm when signed out', () => {
    const harness = createHarness()
    harness.loginState.value = 'signed_out'

    harness.publish.openCreateConfirmation()

    expect(harness.publish.isCreateConfirmOpen.value).toBe(false)
    expect(harness.statuses.at(-1)).toBe('Create blocked: login required.')
  })

  it('tracks visibility changes and updates toggle readiness', () => {
    const harness = createHarness()
    harness.publish.setVisibilityFromSelection(0)
    expect(harness.publish.canChangeVisibility.value).toBe(false)

    harness.publish.setPendingVisibility(2)
    expect(harness.publish.canChangeVisibility.value).toBe(true)
  })

  it('disables visibility changes when the selected item no longer exists', () => {
    const harness = createHarness()
    harness.publish.setVisibilityFromSelection(0)
    harness.publish.setPendingVisibility(2)
    harness.workshopItems.value = []

    expect(harness.publish.canChangeVisibility.value).toBe(false)
  })

  it('runs update visibility flow and mutates workshop list', async () => {
    const harness = createHarness()
    harness.publish.setVisibilityFromSelection(0)
    harness.publish.setPendingVisibility(2)

    await harness.publish.updateVisibilityOnly()

    expect(workshop.updateVisibility).toHaveBeenCalledTimes(1)
    expect(harness.workshopItems.value[0]?.visibility).toBe(2)
    expect(harness.toasts.at(-1)?.title).toBe('Visibility Updated')
  })

  it('opens create confirmation and confirms upload flow', async () => {
    const harness = createHarness()

    harness.publish.openCreateConfirmation()
    expect(harness.publish.isCreateConfirmOpen.value).toBe(true)

    await harness.publish.confirmCreateItem()

    expect(workshop.uploadMod).toHaveBeenCalledTimes(1)
    expect(workshop.uploadMod).toHaveBeenCalledWith({
      draft: expect.objectContaining({
        appId: TEST_WORKSHOP.appId,
        title: 'Create Item'
      })
    })
    expect(harness.publish.isCreateConfirmOpen.value).toBe(false)
    expect(harness.toasts.at(-1)?.title).toBe('Upload Completed')
  })

  it('sends ignored relative paths and allows them to be restored', async () => {
    const harness = createHarness()
    harness.createStagedContentFiles.value[0]!.excluded = true

    harness.publish.openCreateConfirmation()
    expect(harness.publish.isCreateConfirmOpen.value).toBe(false)
    expect(harness.statuses.at(-1)).toContain('include at least one content file')

    harness.createStagedContentFiles.value.push({
      absolutePath: '/mods/keep.txt',
      relativePath: 'keep.txt',
      sizeBytes: 4
    })
    harness.publish.openCreateConfirmation()
    await harness.publish.confirmCreateItem()

    expect(workshop.uploadMod).toHaveBeenCalledWith({
      draft: expect.objectContaining({ excludedContentPaths: ['file.txt'] })
    })

    harness.createStagedContentFiles.value[0]!.excluded = false
    harness.publish.openCreateConfirmation()
    await harness.publish.confirmCreateItem()
    const lastCall = workshop.uploadMod.mock.calls.at(-1) as unknown as [{ draft: Record<string, unknown> }]
    expect(lastCall[0].draft).not.toHaveProperty('excludedContentPaths')
  })

  it('shows success popup after confirming an update', async () => {
    const harness = createHarness()

    harness.publish.openUpdateConfirmation()
    expect(harness.publish.isUpdateConfirmOpen.value).toBe(true)

    await harness.publish.confirmUpdateItem()

    expect(workshop.updateMod).toHaveBeenCalledTimes(1)
    expect(harness.publish.isUpdateConfirmOpen.value).toBe(false)
    expect(harness.toasts.at(-1)?.title).toBe('Update Completed')
  })

  it('shows update failure popup when the update command fails', async () => {
    workshop.updateMod.mockRejectedValueOnce(new Error('[command_failed] upstream failed'))
    const harness = createHarness()

    harness.publish.openUpdateConfirmation()
    await harness.publish.confirmUpdateItem()

    expect(harness.toasts.at(-1)).toEqual({
      title: 'Update Failed',
      tone: 'error'
    })
    expect(harness.statuses.at(-1)).toBe('Update failed: upstream failed')
  })

  it('blocks update confirmation when no pending changes exist', () => {
    const harness = createHarness({ hasPendingUpdateChanges: false })
    harness.publish.openUpdateConfirmation()

    expect(harness.publish.isUpdateConfirmOpen.value).toBe(false)
    expect(harness.statuses.at(-1)).toContain('no changes detected')
  })
})
