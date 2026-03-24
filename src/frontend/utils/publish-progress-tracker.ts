/**
 * Overview: Tracks publish progress state from SteamCMD run events for renderer UI presentation.
 * Responsibility: Maintains reactive progress/title/line state, parses Steam output milestones, and handles timed dismissal on completion/failure.
 */
import { computed, ref, type ComputedRef, type Ref } from 'vue'
import type { RunEvent } from '@shared/contracts'

export type PublishPhase = 'upload' | 'update' | 'visibility'

function isPublishPhase(phase: string | undefined): phase is PublishPhase {
  return phase === 'upload' || phase === 'update' || phase === 'visibility'
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}

export class PublishProgressTracker {
  readonly runId: Ref<string | null> = ref(null)
  readonly phase: Ref<PublishPhase | null> = ref(null)
  readonly visible = ref(false)
  readonly percent = ref(0)
  readonly label = ref('')
  readonly lastLine = ref('')
  readonly title: ComputedRef<string>

  private dismissTimer: ReturnType<typeof setTimeout> | null = null

  constructor(private readonly dismissDelayMs = 2_400) {
    this.title = computed(() => {
      if (this.phase.value === 'update') {
        return 'Updating Workshop Item'
      }
      if (this.phase.value === 'visibility') {
        return 'Updating Item Visibility'
      }
      return 'Uploading Workshop Item'
    })
  }

  reset(): void {
    this.clearDismissTimer()
    this.runId.value = null
    this.phase.value = null
    this.visible.value = false
    this.percent.value = 0
    this.label.value = ''
    this.lastLine.value = ''
  }

  destroy(): void {
    this.clearDismissTimer()
  }

  handleRunEvent(event: RunEvent): void {
    if (event.type === 'phase_changed' && isPublishPhase(event.phase)) {
      this.start(event.runId, event.phase)
      return
    }

    if (event.type === 'run_started' && isPublishPhase(event.phase)) {
      this.start(event.runId, event.phase)
      this.applyProgress(12, this.baseLabel(event.phase))
      return
    }

    if (this.runId.value !== event.runId) {
      return
    }

    if ((event.type === 'stdout' || event.type === 'stderr') && typeof event.line === 'string') {
      this.lastLine.value = event.line
      const parsedProgress = this.parseProgressFromLine(event.line)
      if (parsedProgress) {
        this.applyProgress(parsedProgress.percent, parsedProgress.label)
        return
      }
      if (/error|failed/i.test(event.line)) {
        this.label.value = 'Steam reported an issue. Waiting for final status...'
      }
      return
    }

    if (event.type === 'run_finished') {
      this.applyProgress(100, 'Completed.')
      this.scheduleDismiss()
      return
    }

    if (event.type === 'run_failed') {
      this.label.value = 'Failed. Check logs for details.'
      this.scheduleDismiss()
      return
    }

    if (event.type === 'run_cancelled') {
      this.label.value = 'Cancelled.'
      this.scheduleDismiss()
    }
  }

  private clearDismissTimer(): void {
    if (this.dismissTimer) {
      clearTimeout(this.dismissTimer)
      this.dismissTimer = null
    }
  }

  private baseLabel(phase: PublishPhase): string {
    if (phase === 'update') {
      return 'Preparing update request...'
    }
    if (phase === 'visibility') {
      return 'Preparing visibility update...'
    }
    return 'Preparing upload request...'
  }

  private start(runId: string, phase: PublishPhase): void {
    const isNewRun = this.runId.value !== runId
    this.clearDismissTimer()
    this.visible.value = true
    this.runId.value = runId
    this.phase.value = phase
    if (isNewRun) {
      this.percent.value = 8
      this.lastLine.value = ''
    }
    this.label.value = this.baseLabel(phase)
  }

  private applyProgress(percent: number, label: string): void {
    this.percent.value = Math.max(this.percent.value, clampPercent(percent))
    this.label.value = label
  }

  private parseProgressFromLine(line: string): { percent: number; label: string } | null {
    const normalized = line.trim().toLowerCase()
    if (!normalized) {
      return null
    }

    const percentMatch = normalized.match(/(\d{1,3})(?:\.\d+)?\s*%/)
    if (percentMatch) {
      const rawValue = Number(percentMatch[1])
      if (Number.isFinite(rawValue)) {
        return {
          percent: clampPercent(rawValue),
          label: 'Uploading files to Steam...'
        }
      }
    }

    if (
      normalized.includes('building workshop item') ||
      normalized.includes('creating workshop item') ||
      normalized.includes('preparing update')
    ) {
      return {
        percent: 22,
        label: 'Preparing workshop payload...'
      }
    }

    if (
      normalized.includes('uploading content') ||
      normalized.includes('uploading preview') ||
      normalized.includes('uploading manifest')
    ) {
      return {
        percent: 58,
        label: 'Uploading files to Steam...'
      }
    }

    if (
      normalized.includes('committing') ||
      normalized.includes('finalizing') ||
      normalized.includes('submitting')
    ) {
      return {
        percent: 84,
        label: 'Committing workshop item...'
      }
    }

    if (normalized.includes('published file id')) {
      return {
        percent: 96,
        label: 'Published file id received. Finalizing...'
      }
    }

    if (normalized === 'success.' || normalized === 'success') {
      return {
        percent: 100,
        label: 'Steam reported success.'
      }
    }

    return null
  }

  private scheduleDismiss(): void {
    this.clearDismissTimer()
    this.dismissTimer = setTimeout(() => {
      this.reset()
    }, this.dismissDelayMs)
  }
}
