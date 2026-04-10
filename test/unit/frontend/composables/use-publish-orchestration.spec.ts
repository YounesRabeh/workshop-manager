/** @vitest-environment jsdom */

import { ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { usePublishOrchestration } from '@frontend/composables/usePublishOrchestration'

describe('usePublishOrchestration composable', () => {
  function createHarness(overrides?: {
    isAuthenticated?: boolean
    canAccessUpdate?: boolean
    selectedWorkshopItemId?: string
    publishedFileId?: string
  }) {
    const authenticated = ref(overrides?.isAuthenticated ?? true)
    const canAccessUpdate = ref(overrides?.canAccessUpdate ?? true)
    const selectedWorkshopItemId = ref(overrides?.selectedWorkshopItemId ?? '')
    const publishedFileId = ref(overrides?.publishedFileId ?? '')
    const statusMessages: string[] = []
    const onSignedInRefresh = vi.fn(async () => undefined)
    const onSignedOutReset = vi.fn()

    const orchestration = usePublishOrchestration({
      isAuthenticated: () => authenticated.value,
      canAccessUpdate: () => canAccessUpdate.value,
      getSelectedWorkshopItemId: () => selectedWorkshopItemId.value,
      getUpdateDraftPublishedFileId: () => publishedFileId.value,
      setUpdateDraftPublishedFileId: (value) => {
        publishedFileId.value = value
      },
      setStatusMessage: (message) => {
        statusMessages.push(message)
      },
      onSignedInRefresh,
      onSignedOutReset
    })

    return {
      orchestration,
      authenticated,
      canAccessUpdate,
      selectedWorkshopItemId,
      publishedFileId,
      statusMessages,
      onSignedInRefresh,
      onSignedOutReset
    }
  }

  it('blocks step navigation when signed out', () => {
    const harness = createHarness({ isAuthenticated: false })

    harness.orchestration.goToStep('create')

    expect(harness.orchestration.flowStep.value).toBe('mods')
    expect(harness.statusMessages.at(-1)).toBe('Login required.')
  })

  it('blocks update navigation when no workshop item is selected', () => {
    const harness = createHarness({ canAccessUpdate: false })

    harness.orchestration.goToStep('update')

    expect(harness.orchestration.flowStep.value).toBe('mods')
    expect(harness.statusMessages.at(-1)).toBe('Select an item from Mod List first.')
  })

  it('hydrates update draft published file id when navigating to update', () => {
    const harness = createHarness({
      canAccessUpdate: true,
      selectedWorkshopItemId: '123',
      publishedFileId: ''
    })

    harness.orchestration.goToStep('update')

    expect(harness.orchestration.flowStep.value).toBe('update')
    expect(harness.publishedFileId.value).toBe('123')
  })

  it('tracks publish run events for progress UI', () => {
    const harness = createHarness()

    harness.orchestration.handlePublishRunEvent({
      runId: 'run-1',
      ts: Date.now(),
      type: 'run_started',
      phase: 'upload'
    })

    expect(harness.orchestration.publishProgressVisible.value).toBe(true)
    expect(harness.orchestration.publishProgressTitle.value).toBe('Uploading Workshop Item')
    expect(harness.orchestration.publishProgressPercent.value).toBeGreaterThan(0)
  })

  it('coordinates signed-in and signed-out transitions', async () => {
    const harness = createHarness()
    harness.orchestration.setFlowStep('settings')

    await harness.orchestration.handleSignedIn()
    expect(harness.orchestration.flowStep.value).toBe('mods')
    expect(harness.onSignedInRefresh).toHaveBeenCalledTimes(1)

    harness.orchestration.handleSignedOut()
    expect(harness.orchestration.flowStep.value).toBe('mods')
    expect(harness.onSignedOutReset).toHaveBeenCalledTimes(1)
  })
})
