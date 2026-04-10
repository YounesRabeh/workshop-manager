/**
 * Overview: Centralizes publish-flow navigation and progress orchestration for App shell wiring.
 * Responsibility: Owns flow-step state, publish-progress tracker lifecycle/event routing,
 * and signed-in/signed-out flow coordination with navigation guards.
 */
import { type Ref, ref } from 'vue'
import type { RunEvent } from '@shared/contracts'
import { PublishProgressTracker } from '../utils/publish-progress-tracker'
import type { FlowStep } from '../types/ui'

interface UsePublishOrchestrationOptions {
  isAuthenticated: () => boolean
  canAccessUpdate: () => boolean
  getSelectedWorkshopItemId: () => string
  getUpdateDraftPublishedFileId: () => string
  setUpdateDraftPublishedFileId: (value: string) => void
  setStatusMessage: (message: string) => void
  onSignedInRefresh: () => Promise<void>
  onSignedOutReset: () => void
}

interface UsePublishOrchestrationResult {
  flowStep: Ref<FlowStep>
  publishProgressVisible: Ref<boolean>
  publishProgressPercent: Ref<number>
  publishProgressLabel: Ref<string>
  publishProgressTitle: Readonly<Ref<string>>
  goToStep: (step: FlowStep) => void
  handlePublishRunEvent: (event: RunEvent) => void
  handleSignedIn: () => Promise<void>
  handleSignedOut: () => void
  setFlowStep: (step: FlowStep) => void
  destroy: () => void
}

export function usePublishOrchestration(options: UsePublishOrchestrationOptions): UsePublishOrchestrationResult {
  const flowStep = ref<FlowStep>('mods')
  const publishProgress = new PublishProgressTracker()

  function setFlowStep(step: FlowStep): void {
    flowStep.value = step
  }

  function goToStep(step: FlowStep): void {
    if (!options.isAuthenticated()) {
      options.setStatusMessage('Login required.')
      return
    }

    if (step === 'update' && !options.canAccessUpdate()) {
      options.setStatusMessage('Select an item from Mod List first.')
      return
    }

    if (
      step === 'update' &&
      options.getSelectedWorkshopItemId().trim().length > 0 &&
      options.getUpdateDraftPublishedFileId().trim().length === 0
    ) {
      options.setUpdateDraftPublishedFileId(options.getSelectedWorkshopItemId())
    }

    setFlowStep(step)
  }

  function handlePublishRunEvent(event: RunEvent): void {
    publishProgress.handleRunEvent(event)
  }

  async function handleSignedIn(): Promise<void> {
    setFlowStep('mods')
    await options.onSignedInRefresh()
  }

  function handleSignedOut(): void {
    publishProgress.reset()
    options.onSignedOutReset()
    setFlowStep('mods')
  }

  return {
    flowStep,
    publishProgressVisible: publishProgress.visible,
    publishProgressPercent: publishProgress.percent,
    publishProgressLabel: publishProgress.label,
    publishProgressTitle: publishProgress.title,
    goToStep,
    handlePublishRunEvent,
    handleSignedIn,
    handleSignedOut,
    setFlowStep,
    destroy: () => {
      publishProgress.destroy()
    }
  }
}
