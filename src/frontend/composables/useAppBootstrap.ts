/**
 * Overview: Handles renderer bootstrap lifecycle and Steam run-event subscription setup.
 * Responsibility: Mounts global listeners, validates preload bridge availability, runs startup async tasks, and performs teardown on unmount.
 */
import { onMounted, onUnmounted, ref, type Ref } from 'vue'
import type { RunEvent } from '@shared/contracts'

interface UseAppBootstrapOptions {
  appVersion: Ref<string>
  mountGlobalListeners: () => void
  unmountGlobalListeners: () => void
  handleRunEvent: (event: RunEvent) => void
  ensureSteamCmdInstalled: () => Promise<unknown>
  refreshRememberedLoginState: () => Promise<void>
  loadAdvancedSettings: () => Promise<void>
  loadAppVersion: (target: { value: string }) => Promise<void>
  setStatusMessage: (message: string) => void
}

export function useAppBootstrap(options: UseAppBootstrapOptions): { isBootstrapping: Ref<boolean> } {
  const isBootstrapping = ref(true)
  let disposeRunEventListener: (() => void) | null = null

  onMounted(async () => {
    options.mountGlobalListeners()

    if (!(window as Window & { workshop?: unknown }).workshop) {
      options.setStatusMessage('Bridge error (bridge_unavailable): preload API not found. Restart the app/dev server.')
      isBootstrapping.value = false
      return
    }

    disposeRunEventListener = window.workshop.onRunEvent((event) => {
      options.handleRunEvent(event)
    })

    try {
      await Promise.all([
        options.ensureSteamCmdInstalled(),
        options.refreshRememberedLoginState(),
        options.loadAdvancedSettings(),
        options.loadAppVersion(options.appVersion)
      ])
    } finally {
      isBootstrapping.value = false
    }
  })

  onUnmounted(() => {
    if (disposeRunEventListener) {
      disposeRunEventListener()
      disposeRunEventListener = null
    }
    options.unmountGlobalListeners()
  })

  return {
    isBootstrapping
  }
}
