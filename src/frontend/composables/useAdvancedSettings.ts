/**
 * Overview: Manages advanced settings and SteamCMD configuration state in the renderer.
 * Responsibility: Loads/saves advanced settings, handles SteamCMD install/manual-path flows, and exposes related UI state.
 */
import { reactive, ref } from 'vue'
import type { AdvancedSettings } from '@shared/contracts'
import type { AdvancedSettingsState } from '../types/ui'

interface ApiFailure {
  message: string
  code: string
}

interface UseAdvancedSettingsOptions {
  normalizeError: (error: unknown) => ApiFailure
  setStatusMessage: (message: string) => void
}

export function useAdvancedSettings(options: UseAdvancedSettingsOptions) {
  const isSteamCmdDetected = ref(false)
  const isAdvancedOptionsOpen = ref(false)
  const installLogPath = ref('')

  const advancedSettings = reactive<AdvancedSettingsState>({
    webApiEnabled: false,
    webApiKey: '',
    hasWebApiKey: false,
    secureStorageAvailable: true,
    steamCmdManualPath: '',
    steamCmdInstalled: false,
    steamCmdSource: 'missing',
    isSaving: false,
    statusMessage: ''
  })

  function setWebApiKey(value: string): void {
    advancedSettings.webApiKey = value
  }

  function setSteamCmdManualPath(value: string): void {
    advancedSettings.steamCmdManualPath = value
  }

  function toggleAdvancedOptions(): void {
    isAdvancedOptionsOpen.value = !isAdvancedOptionsOpen.value
  }

  function applyAdvancedSettings(payload: AdvancedSettings): void {
    advancedSettings.webApiEnabled = payload.webApiEnabled
    advancedSettings.hasWebApiKey = payload.hasWebApiKey
    advancedSettings.secureStorageAvailable = payload.secureStorageAvailable
    advancedSettings.steamCmdManualPath = payload.steamCmdManualPath ?? ''
    advancedSettings.steamCmdInstalled = payload.steamCmdInstalled === true
    advancedSettings.steamCmdSource = payload.steamCmdSource
  }

  async function loadInstallLogPath(): Promise<void> {
    try {
      const payload = await window.workshop.getInstallLog()
      installLogPath.value = payload.path
    } catch (error) {
      const parsed = options.normalizeError(error)
      advancedSettings.statusMessage = `Install log lookup failed (${parsed.code}): ${parsed.message}`
    }
  }

  async function ensureSteamCmdInstalled(): Promise<void> {
    isSteamCmdDetected.value = false
    options.setStatusMessage('Checking SteamCMD installation...')
    try {
      const payload = await window.workshop.ensureSteamCmdInstalled()
      isSteamCmdDetected.value = true
      advancedSettings.steamCmdInstalled = true
      advancedSettings.steamCmdSource = payload.source
      installLogPath.value = ''
      if (payload.source === 'manual') {
        advancedSettings.steamCmdManualPath = payload.executablePath
      }
      options.setStatusMessage('SteamCMD is ready.')
    } catch (error) {
      const parsed = options.normalizeError(error)
      isSteamCmdDetected.value = false
      advancedSettings.steamCmdInstalled = false
      options.setStatusMessage(`Install error (${parsed.code}): ${parsed.message}`)
      await loadInstallLogPath()
    }
  }

  async function openInstallLog(): Promise<void> {
    if (installLogPath.value.trim().length === 0) {
      await loadInstallLogPath()
    }

    const targetPath = installLogPath.value.trim()
    if (!targetPath) {
      options.setStatusMessage('SteamCMD install log path is not available yet.')
      return
    }

    try {
      const result = await window.workshop.openPath({ path: targetPath })
      if (result.error) {
        options.setStatusMessage(`Open install log failed: ${result.error}`)
      }
    } catch (error) {
      const parsed = options.normalizeError(error)
      options.setStatusMessage(`Open install log failed (${parsed.code}): ${parsed.message}`)
    }
  }

  async function loadAdvancedSettings(): Promise<void> {
    try {
      const payload = await window.workshop.getAdvancedSettings()
      applyAdvancedSettings(payload)
    } catch (error) {
      const parsed = options.normalizeError(error)
      advancedSettings.statusMessage = `Advanced options load failed (${parsed.code}): ${parsed.message}`
    }
  }

  async function pickSteamCmdManualPath(): Promise<void> {
    try {
      const path = await window.workshop.pickSteamCmdExecutable()
      if (!path) {
        return
      }
      advancedSettings.steamCmdManualPath = path
      advancedSettings.statusMessage = 'SteamCMD executable selected. Save Advanced Options to apply it.'
    } catch (error) {
      const parsed = options.normalizeError(error)
      advancedSettings.statusMessage = `SteamCMD path selection failed (${parsed.code}): ${parsed.message}`
    }
  }

  async function saveAdvancedSettings(): Promise<void> {
    if (advancedSettings.isSaving) {
      return
    }

    if (!advancedSettings.secureStorageAvailable && advancedSettings.webApiKey.trim().length > 0) {
      advancedSettings.statusMessage = 'Secure storage is unavailable. Clear the Web API key field to save SteamCMD settings only.'
      return
    }

    try {
      advancedSettings.isSaving = true
      advancedSettings.statusMessage = ''
      const normalizedKey = advancedSettings.webApiKey.trim()
      const implicitEnable = normalizedKey.length > 0 ? true : advancedSettings.webApiEnabled
      const payload = await window.workshop.saveAdvancedSettings({
        webApiEnabled: implicitEnable,
        webApiKey: normalizedKey.length > 0 ? normalizedKey : undefined,
        steamCmdManualPath: advancedSettings.steamCmdManualPath
      })
      applyAdvancedSettings(payload)
      isSteamCmdDetected.value = payload.steamCmdInstalled
      options.setStatusMessage(payload.steamCmdInstalled ? 'SteamCMD is ready.' : 'SteamCMD executable is not configured yet.')
      advancedSettings.webApiKey = ''
      advancedSettings.statusMessage = 'Advanced options saved.'
    } catch (error) {
      const parsed = options.normalizeError(error)
      advancedSettings.statusMessage = `Advanced options save failed (${parsed.code}): ${parsed.message}`
    } finally {
      advancedSettings.isSaving = false
    }
  }

  async function clearSavedWebApiKey(): Promise<void> {
    if (advancedSettings.isSaving) {
      return
    }

    try {
      advancedSettings.isSaving = true
      advancedSettings.statusMessage = ''
      const payload = await window.workshop.saveAdvancedSettings({
        webApiEnabled: advancedSettings.webApiEnabled,
        clearWebApiKey: true
      })
      applyAdvancedSettings(payload)
      advancedSettings.webApiKey = ''
      advancedSettings.statusMessage = 'Saved Web API key removed.'
    } catch (error) {
      const parsed = options.normalizeError(error)
      advancedSettings.statusMessage = `Web API key removal failed (${parsed.code}): ${parsed.message}`
    } finally {
      advancedSettings.isSaving = false
    }
  }

  return {
    isSteamCmdDetected,
    isAdvancedOptionsOpen,
    installLogPath,
    advancedSettings,
    setWebApiKey,
    setSteamCmdManualPath,
    toggleAdvancedOptions,
    ensureSteamCmdInstalled,
    openInstallLog,
    loadAdvancedSettings,
    pickSteamCmdManualPath,
    saveAdvancedSettings,
    clearSavedWebApiKey
  }
}
