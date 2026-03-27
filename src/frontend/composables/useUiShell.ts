/**
 * Overview: Provides app-shell UI state and global interaction helpers.
 * Responsibility: Manages toasts, about/fullscreen state, run-log selection/loading, 
 * and global keyboard/mouse listeners tied to app navigation.
 */
import { ref, type Ref } from 'vue'
import type { PersistedRunLog } from '@shared/contracts'
import { createAppGlobalKeyDownHandler, createAppGlobalMouseDownHandler } from '../events/keyboard-events'
import type { FlowStep } from '../types/ui'

interface UseUiShellOptions {
  flowStep: Ref<FlowStep>
  isAuthenticated: () => boolean
  goToStep: (step: FlowStep) => void
  onFullscreenFailure?: () => void
}

interface UiToast {
  id: number
  tone: 'success' | 'error' | 'warning' | 'info'
  title: string
  detail: string
}

type UiToastInput = Omit<UiToast, 'id'> & { durationMs?: number }

export function useUiShell(options: UseUiShellOptions) {
  const isFullscreen = ref(false)
  const isAboutOpen = ref(false)
  const activeToast = ref<UiToast | null>(null)
  const recentRuns = ref<PersistedRunLog[]>([])
  const selectedRunId = ref('')
  const selectedRun = ref<PersistedRunLog | null>(null)
  const showLoginLogs = ref(false)
  let toastTimer: ReturnType<typeof setTimeout> | null = null

  function statusBadgeClass(status: PersistedRunLog['status']): string {
    if (status === 'success') {
      return 'border-emerald-200 bg-emerald-50 text-emerald-700'
    }
    if (status === 'failed') {
      return 'border-rose-200 bg-rose-50 text-rose-700'
    }
    if (status === 'cancelled') {
      return 'border-slate-300 bg-slate-100 text-slate-700'
    }
    return 'border-amber-200 bg-amber-50 text-amber-700'
  }

  function formatRunTimestamp(runId: string): string {
    const timestamp = Number(runId.split('-')[0] ?? '')
    if (!Number.isFinite(timestamp) || timestamp <= 0) {
      return runId
    }
    return new Date(timestamp).toLocaleString()
  }

  async function selectRun(runId: string): Promise<void> {
    selectedRunId.value = runId
    try {
      const payload = await window.workshop.getRunLog(runId)
      if (payload) {
        selectedRun.value = payload
        return
      }
    } catch {
      // Fall through to local list fallback.
    }

    selectedRun.value = recentRuns.value.find((run) => run.runId === runId) ?? null
  }

  async function refreshRunLogs(): Promise<void> {
    try {
      const payload = await window.workshop.getRunLogs()
      const runs = Array.isArray(payload) ? payload : []
      recentRuns.value = runs

      const nextRunId = selectedRunId.value || runs[0]?.runId || ''
      if (!nextRunId) {
        selectedRunId.value = ''
        selectedRun.value = null
        return
      }

      await selectRun(nextRunId)
    } catch {
      recentRuns.value = []
      selectedRunId.value = ''
      selectedRun.value = null
    }
  }

  async function showTimeoutLogs(): Promise<void> {
    showLoginLogs.value = true
    await refreshRunLogs()
  }

  function syncFullscreenState(): void {
    isFullscreen.value = Boolean(document.fullscreenElement)
  }

  async function toggleFullscreen(): Promise<void> {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen()
        return
      }
      await document.exitFullscreen()
    } catch {
      options.onFullscreenFailure?.()
    }
  }

  function openAboutModal(): void {
    isAboutOpen.value = true
  }

  function closeAboutModal(): void {
    isAboutOpen.value = false
  }

  function canGoBackFlow(): boolean {
    return options.isAuthenticated() && options.flowStep.value !== 'mods'
  }

  function goBackFlow(): void {
    if (canGoBackFlow()) {
      options.goToStep('mods')
    }
  }

  function scrollViewport(direction: 1 | -1): void {
    const topOffset = direction * 140
    const scrollingElement = document.scrollingElement
    if (scrollingElement) {
      scrollingElement.scrollBy({ top: topOffset, behavior: 'smooth' })
      return
    }
    window.scrollBy({ top: topOffset, behavior: 'smooth' })
  }

  const onGlobalKeyDown = createAppGlobalKeyDownHandler({
    isAboutOpen: () => isAboutOpen.value,
    toggleFullscreen: () => {
      void toggleFullscreen()
    },
    closeAbout: closeAboutModal,
    goToStep: options.goToStep,
    scrollViewport,
    canGoBack: canGoBackFlow,
    goBack: goBackFlow,
    isAuthenticated: options.isAuthenticated
  })

  const onGlobalMouseDown = createAppGlobalMouseDownHandler({
    canGoBack: canGoBackFlow,
    goBack: goBackFlow
  })

  function toastToneClass(tone: UiToast['tone']): string {
    if (tone === 'success') {
      return 'border-emerald-400/60 bg-emerald-900/85 text-emerald-100'
    }
    if (tone === 'warning') {
      return 'border-amber-300/70 bg-amber-900/85 text-amber-100'
    }
    if (tone === 'info') {
      return 'border-sky-300/70 bg-sky-900/85 text-sky-100'
    }
    return 'border-rose-400/60 bg-rose-900/85 text-rose-100'
  }

  function showToast(toast: UiToastInput): void {
    const durationMs = typeof toast.durationMs === 'number' && toast.durationMs > 0 ? toast.durationMs : 3800
    activeToast.value = {
      id: Date.now(),
      tone: toast.tone,
      title: toast.title,
      detail: toast.detail
    }

    if (toastTimer) {
      clearTimeout(toastTimer)
    }
    toastTimer = setTimeout(() => {
      activeToast.value = null
      toastTimer = null
    }, durationMs)
  }

  function mountGlobalListeners(): void {
    syncFullscreenState()
    document.addEventListener('fullscreenchange', syncFullscreenState)
    document.addEventListener('keydown', onGlobalKeyDown)
    document.addEventListener('mousedown', onGlobalMouseDown)
    document.addEventListener('auxclick', onGlobalMouseDown)
  }

  function unmountGlobalListeners(): void {
    document.removeEventListener('fullscreenchange', syncFullscreenState)
    document.removeEventListener('keydown', onGlobalKeyDown)
    document.removeEventListener('mousedown', onGlobalMouseDown)
    document.removeEventListener('auxclick', onGlobalMouseDown)
    if (toastTimer) {
      clearTimeout(toastTimer)
      toastTimer = null
    }
  }

  return {
    isFullscreen,
    isAboutOpen,
    activeToast,
    recentRuns,
    selectedRunId,
    selectedRun,
    showLoginLogs,
    statusBadgeClass,
    formatRunTimestamp,
    selectRun,
    refreshRunLogs,
    showTimeoutLogs,
    toggleFullscreen,
    openAboutModal,
    closeAboutModal,
    toastToneClass,
    showToast,
    mountGlobalListeners,
    unmountGlobalListeners
  }
}
