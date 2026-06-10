import { describe, expect, it, vi } from 'vitest'
import { PublishProgressTracker } from '@frontend/utils/publish-progress-tracker'

describe('PublishProgressTracker', () => {
  it('keeps visibility progress neutral for transient Steam failure-looking output', () => {
    const tracker = new PublishProgressTracker()

    tracker.handleRunEvent({
      runId: 'visibility-run',
      ts: Date.now(),
      type: 'run_started',
      phase: 'visibility'
    })

    tracker.handleRunEvent({
      runId: 'visibility-run',
      ts: Date.now(),
      type: 'stdout',
      phase: 'visibility',
      line: 'Failed to update workshop item (Failure)'
    })

    expect(tracker.label.value).toBe('Preparing visibility update...')

    tracker.handleRunEvent({
      runId: 'visibility-run',
      ts: Date.now(),
      type: 'run_finished',
      phase: 'visibility'
    })

    expect(tracker.label.value).toBe('Completed.')
  })

  it('still reports transient issues for upload and update output', () => {
    const tracker = new PublishProgressTracker()

    tracker.handleRunEvent({
      runId: 'upload-run',
      ts: Date.now(),
      type: 'run_started',
      phase: 'upload'
    })

    tracker.handleRunEvent({
      runId: 'upload-run',
      ts: Date.now(),
      type: 'stderr',
      phase: 'upload',
      line: 'Failed to connect, retrying...'
    })

    expect(tracker.label.value).toBe('Steam reported an issue. Waiting for final status...')
  })

  it('dismisses after completion', () => {
    vi.useFakeTimers()
    const tracker = new PublishProgressTracker(100)

    tracker.handleRunEvent({
      runId: 'update-run',
      ts: Date.now(),
      type: 'run_started',
      phase: 'update'
    })
    tracker.handleRunEvent({
      runId: 'update-run',
      ts: Date.now(),
      type: 'run_finished',
      phase: 'update'
    })

    expect(tracker.visible.value).toBe(true)
    vi.advanceTimersByTime(100)
    expect(tracker.visible.value).toBe(false)
    vi.useRealTimers()
  })
})
