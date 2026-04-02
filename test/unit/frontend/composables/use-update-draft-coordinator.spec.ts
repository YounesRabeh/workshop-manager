/** @vitest-environment jsdom */

import { computed, nextTick, reactive, ref } from 'vue'
import { describe, expect, it } from 'vitest'
import type { WorkshopItemSummary } from '@shared/contracts'
import { useUpdateDraftCoordinator } from '@frontend/composables/useUpdateDraftCoordinator'
import { createEmptyDraft } from '@frontend/composables/useDrafts'
import type { FlowStep } from '@frontend/types/ui'

function createHarness() {
  const flowStep = ref<FlowStep>('mods')
  const selectedWorkshopItemId = ref('')
  const workshopItems = ref<WorkshopItemSummary[]>([
    {
      publishedFileId: '100',
      title: 'Alpha Item',
      appId: '480',
      visibility: 2
    },
    {
      publishedFileId: '200',
      title: 'Beta Item',
      appId: '500',
      visibility: 0
    }
  ])
  const selectedWorkshopItem = computed(() =>
    workshopItems.value.find((item) => item.publishedFileId === selectedWorkshopItemId.value)
  )
  const updateDraft = reactive(createEmptyDraft())
  const updateDraftCache = ref<Record<string, typeof updateDraft>>({})
  const isHydratingUpdateDraft = ref(false)
  const visibilitySelections: Array<0 | 1 | 2 | 3> = []
  const statuses: string[] = []

  const coordinator = useUpdateDraftCoordinator({
    flowStep,
    selectedWorkshopItemId,
    selectedWorkshopItem,
    workshopItems,
    updateDraft,
    updateDraftCache,
    isHydratingUpdateDraft,
    setVisibilityFromSelection: (value) => {
      visibilitySelections.push(value)
    },
    setStatusMessage: (message) => {
      statuses.push(message)
    }
  })

  return {
    flowStep,
    selectedWorkshopItemId,
    workshopItems,
    updateDraft,
    updateDraftCache,
    visibilitySelections,
    statuses,
    coordinator
  }
}

describe('useUpdateDraftCoordinator composable', () => {
  it('hydrates the selected workshop item into the update draft and enters update flow', () => {
    const harness = createHarness()

    harness.coordinator.hydrateSelectedWorkshopItem(harness.workshopItems.value[0]!)

    expect(harness.selectedWorkshopItemId.value).toBe('100')
    expect(harness.updateDraft.publishedFileId).toBe('100')
    expect(harness.updateDraft.appId).toBe('480')
    expect(harness.updateDraft.title).toBe('Alpha Item')
    expect(harness.flowStep.value).toBe('update')
    expect(harness.visibilitySelections).toEqual([2])
    expect(harness.statuses.at(-1)).toBe('Loaded workshop item: Alpha Item')
  })

  it('prefers cached draft state when rehydrating an existing selection', () => {
    const harness = createHarness()
    harness.updateDraftCache.value['100'] = {
      ...createEmptyDraft(),
      publishedFileId: '100',
      appId: '480',
      title: 'Cached Title',
      contentFolder: '/mods/cached',
      previewFile: '/mods/cached.png',
      releaseNotes: 'Remember me'
    }

    harness.coordinator.hydrateSelectedWorkshopItem(harness.workshopItems.value[0]!)

    expect(harness.updateDraft.title).toBe('Cached Title')
    expect(harness.updateDraft.contentFolder).toBe('/mods/cached')
    expect(harness.updateDraft.previewFile).toBe('/mods/cached.png')
    expect(harness.updateDraft.releaseNotes).toBe('Remember me')
  })

  it('reconciles a stale selection by hydrating the first remaining workshop item', () => {
    const harness = createHarness()
    harness.selectedWorkshopItemId.value = '999'

    harness.coordinator.reconcileWorkshopSelection()

    expect(harness.selectedWorkshopItemId.value).toBe('100')
    expect(harness.updateDraft.publishedFileId).toBe('100')
    expect(harness.flowStep.value).toBe('mods')
  })

  it('returns to mods when update flow loses its final selected workshop item', () => {
    const harness = createHarness()
    harness.flowStep.value = 'update'
    harness.selectedWorkshopItemId.value = '100'
    harness.workshopItems.value = []

    harness.coordinator.reconcileWorkshopSelection()

    expect(harness.selectedWorkshopItemId.value).toBe('')
    expect(harness.flowStep.value).toBe('mods')
  })

  it('caches draft edits for the current selected workshop item', async () => {
    const harness = createHarness()
    harness.coordinator.hydrateSelectedWorkshopItem(harness.workshopItems.value[0]!)

    harness.updateDraft.title = 'Edited Title'
    harness.updateDraft.releaseNotes = 'Updated notes'
    await nextTick()

    expect(harness.updateDraftCache.value['100']).toMatchObject({
      title: 'Edited Title',
      releaseNotes: 'Updated notes'
    })
  })
})
