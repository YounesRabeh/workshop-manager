/** @vitest-environment jsdom */

import { computed, reactive, ref } from 'vue'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { usePublishActions } from '../../src/frontend/composables/usePublishActions'

describe('usePublishActions composable', () => {
  const workshop = {
    uploadMod: vi.fn(async () => ({ publishedFileId: '200' })),
    updateMod: vi.fn(async () => ({ publishedFileId: '100' })),
    updateVisibility: vi.fn(async () => ({ ok: true })),
    getMyWorkshopItems: vi.fn(async () => [
      { publishedFileId: '100', title: 'Updated', appId: '480', visibility: 2 }
    ])
  }

  beforeEach(() => {
    vi.clearAllMocks()
    ;(window as unknown as { workshop: typeof workshop }).workshop = workshop
  })

  function createHarness(options?: { hasPendingUpdateChanges?: boolean }) {
    const loginState = ref<'signed_out' | 'signed_in'>('signed_in')
    const selectedWorkshopItemId = ref('100')
    const workshopItems = ref([{ publishedFileId: '100', title: 'Item', appId: '480', visibility: 0 as 0 | 1 | 2 | 3 }])
    const selectedWorkshopItem = computed(() => workshopItems.value[0])
    const workshopFilterAppId = ref('')
    const createDraft = reactive({
      appId: '480',
      publishedFileId: '',
      contentFolder: '/mods',
      previewFile: '',
      title: 'Create Item',
      releaseNotes: ''
    })
    const updateDraft = reactive({
      appId: '480',
      publishedFileId: '100',
      contentFolder: '/mods',
      previewFile: '',
      title: 'Update Item',
      releaseNotes: ''
    })
    const createRequirements = computed(() => ({ valid: true, appId: true, contentFolder: true, title: true }))
    const updateRequirements = computed(() => ({ valid: true, appId: true, publishedFileId: true, title: true }))
    const hasPendingUpdateChanges = computed(() => options?.hasPendingUpdateChanges ?? true)
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
      createRequirements,
      updateRequirements,
      hasPendingUpdateChanges,
      updateDraftCache,
      normalizeError: (error) => ({ code: 'command_failed', message: error instanceof Error ? error.message : 'error' }),
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

    return { loginState, statuses, toasts, publish, workshopItems }
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
        appId: '480',
        title: 'Create Item'
      })
    })
    expect(harness.publish.isCreateConfirmOpen.value).toBe(false)
    expect(harness.toasts.at(-1)?.title).toBe('Upload Completed')
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
    expect(harness.statuses.at(-1)).toBe('Update failed. See popup.')
  })

  it('blocks update confirmation when no pending changes exist', () => {
    const harness = createHarness({ hasPendingUpdateChanges: false })
    harness.publish.openUpdateConfirmation()

    expect(harness.publish.isUpdateConfirmOpen.value).toBe(false)
    expect(harness.statuses.at(-1)).toContain('no changes detected')
  })
})
