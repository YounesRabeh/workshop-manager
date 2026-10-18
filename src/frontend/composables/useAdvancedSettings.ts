/**
 * Overview: Manages advanced settings and SteamCMD configuration state in the renderer.
 * Responsibility: Loads/saves advanced settings, handles SteamCMD install/manual-path flows, and exposes related UI state.
 */
import { reactive, ref } from 'vue'
import type { AdvancedSettings } from '@shared/contracts'
import { isSteamCmdMissingConfigurationMessage } from '@shared/api-error-utils'
import {
  STEAMCMD_TIMEOUT_DISABLED_VALUE,
  STEAMCMD_TIMEOUT_LIMITS,
  type SteamCmdTimeoutSettings
} from '@shared/runtime-settings'
import type { AdvancedSettingsState } from '../types/ui'

interface ApiFailure {
  message: string
  code: string
}

interface UseAdvancedSettingsOptions {
  normalizeError: (error: unknown) => ApiFailure
  setStatusMessage: (message: string) => void
}

/** Provides reactive settings state and actions for Web API and SteamCMD configuration. */
export function useAdvancedSettings(options: UseAdvancedSettingsOptions) {
  const isSteamCmdDetected = ref(false)
  const isAdvancedOptionsOpen = ref(false)
  const installLogPath = ref('')
  let successStatusTimeout: ReturnType<typeof setTimeout> | null = null

  const advancedSettings = reactive<AdvancedSettingsState>({
    webApiEnabled: false,
    webApiKey: '',
    hasWebApiKey: false,
    secureStorageAvailable: true,
    steamCmdManualPath: '',
    steamCmdInstalled: false,
    steamCmdSource: 'missing',
    loginTimeoutMs: '',
    storedSessionTimeoutMs: '',
    workshopTimeoutMs: '',
    isSaving: false,
    statusMessage: ''
  })

  /** Stores the Web API key currently entered in advanced settings. */
  function setWebApiKey(value: string): void {
    advancedSettings.webApiKey = value
  }

  /** Stores the user-selected path to a manual SteamCMD executable. */
  function setSteamCmdManualPath(value: string): void {
    advancedSettings.steamCmdManualPath = value
  }

  /** Stores the login timeout text until settings are validated and saved. */
  function setLoginTimeoutMs(value: string): void {
    advancedSettings.loginTimeoutMs = value
  }

  /** Stores the saved-session timeout text until settings are validated and saved. */
  function setStoredSessionTimeoutMs(value: string): void {
    advancedSettings.storedSessionTimeoutMs = value
  }

  /** Stores the Workshop timeout text until settings are validated and saved. */
  function setWorkshopTimeoutMs(value: string): void {
    advancedSettings.workshopTimeoutMs = value
  }

  /** Toggles visibility of the advanced settings panel. */
  function toggleAdvancedOptions(): void {
    isAdvancedOptionsOpen.value = !isAdvancedOptionsOpen.value
  }

  /** Opens advanced options and updates related UI state. */
  function openAdvancedOptions(): void {
    isAdvancedOptionsOpen.value = true
  }

  /** Converts milliseconds to the seconds string used by the timeout inputs. */
  function millisecondsToSecondsString(value: number): string {
    if (value === STEAMCMD_TIMEOUT_DISABLED_VALUE) {
      return String(STEAMCMD_TIMEOUT_DISABLED_VALUE)
    }

    return String(Math.round(value / 1000))
  }

  /** Clears a success message after two seconds unless a newer message replaced it. */
  function scheduleSuccessStatusClear(message: string): void {
    if (successStatusTimeout) {
      clearTimeout(successStatusTimeout)
    }

    successStatusTimeout = setTimeout(() => {
      if (advancedSettings.statusMessage === message) {
        advancedSettings.statusMessage = ''
      }
      successStatusTimeout = null
    }, 2_000)
  }

  /** Copies persisted settings into the reactive form, converting timeouts to seconds. */
  function applyAdvancedSettings(payload: AdvancedSettings): void {
    advancedSettings.webApiEnabled = payload.webApiEnabled
    advancedSettings.hasWebApiKey = payload.hasWebApiKey
    advancedSettings.secureStorageAvailable = payload.secureStorageAvailable
    advancedSettings.steamCmdManualPath = payload.steamCmdManualPath ?? ''
    advancedSettings.steamCmdInstalled = payload.steamCmdInstalled === true
    advancedSettings.steamCmdSource = payload.steamCmdSource
    advancedSettings.loginTimeoutMs = millisecondsToSecondsString(payload.timeouts.loginTimeoutMs)
    advancedSettings.storedSessionTimeoutMs = millisecondsToSecondsString(payload.timeouts.storedSessionTimeoutMs)
    advancedSettings.workshopTimeoutMs = millisecondsToSecondsString(payload.timeouts.workshopTimeoutMs)
  }

  /** Validates a timeout field in seconds and converts it to milliseconds. */
  function parseTimeoutValue(
    fieldLabel: string,
    rawValue: string,
    min: number,
    max: number,
    allowDisabled = false
  ): number | null {
    const normalized = rawValue.trim()
    if (!/^\d+$/.test(normalized)) {
      advancedSettings.statusMessage = `${fieldLabel} must be a whole number of seconds.`
      return null
    }

    const parsedSeconds = Number(normalized)
    if (allowDisabled && parsedSeconds === STEAMCMD_TIMEOUT_DISABLED_VALUE) {
      return STEAMCMD_TIMEOUT_DISABLED_VALUE
    }

    const minSeconds = Math.round(min / 1000)
    const maxSeconds = Math.round(max / 1000)

    if (!Number.isFinite(parsedSeconds) || parsedSeconds < minSeconds || parsedSeconds > maxSeconds) {
      advancedSettings.statusMessage = `${fieldLabel} must be between ${minSeconds} and ${maxSeconds} seconds.`
      return null
    }

    return parsedSeconds * 1000
  }

  /** Validates all three timeout fields and returns them in milliseconds. */
  function parseTimeoutSettings(): SteamCmdTimeoutSettings | null {
    const loginTimeoutMs = parseTimeoutValue(
      'Login timeout',
      advancedSettings.loginTimeoutMs,
      STEAMCMD_TIMEOUT_LIMITS.loginTimeoutMs.min,
      STEAMCMD_TIMEOUT_LIMITS.loginTimeoutMs.max,
      true
    )
    if (loginTimeoutMs === null) {
      return null
    }

    const storedSessionTimeoutMs = parseTimeoutValue(
      'Saved session timeout',
      advancedSettings.storedSessionTimeoutMs,
      STEAMCMD_TIMEOUT_LIMITS.storedSessionTimeoutMs.min,
      STEAMCMD_TIMEOUT_LIMITS.storedSessionTimeoutMs.max,
      true
    )
    if (storedSessionTimeoutMs === null) {
      return null
    }

    const workshopTimeoutMs = parseTimeoutValue(
      'Workshop action timeout',
      advancedSettings.workshopTimeoutMs,
      STEAMCMD_TIMEOUT_LIMITS.workshopTimeoutMs.min,
      STEAMCMD_TIMEOUT_LIMITS.workshopTimeoutMs.max,
      true
    )
    if (workshopTimeoutMs === null) {
      return null
    }

    return {
      loginTimeoutMs,
      storedSessionTimeoutMs,
      workshopTimeoutMs
    }
  }

  /** Retrieves the current SteamCMD installation log path from the backend. */
  async function loadInstallLogPath(): Promise<void> {
    try {
      const payload = await window.workshop.getInstallLog()
      installLogPath.value = payload.path
    } catch (error) {
      const parsed = options.normalizeError(error)
      advancedSettings.statusMessage = `Install log lookup failed (${parsed.code}): ${parsed.message}`
    }
  }

  /** Checks SteamCMD availability and starts installation when it is missing. */
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
      if (isSteamCmdMissingConfigurationMessage(parsed.message)) {
        openAdvancedOptions()
        options.setStatusMessage('SteamCMD not found. Advanced options opened. Add the SteamCMD executable path.')
      } else {
        options.setStatusMessage(`Install error (${parsed.code}): ${parsed.message}`)
      }
      await loadInstallLogPath()
    }
  }

  /** Opens install log and updates related UI state. */
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

  /** Loads advanced settings from its configured source. */
  async function loadAdvancedSettings(): Promise<void> {
    try {
      const payload = await window.workshop.getAdvancedSettings()
      applyAdvancedSettings(payload)
    } catch (error) {
      const parsed = options.normalizeError(error)
      advancedSettings.statusMessage = `Advanced options load failed (${parsed.code}): ${parsed.message}`
    }
  }

  /** Opens a file picker and stores the chosen SteamCMD executable path. */
  async function pickSteamCmdManualPath(): Promise<void> {
    try {
      const path = await window.workshop.pickSteamCmdExecutable()
      if (!path) {
        return
      }
      advancedSettings.steamCmdManualPath = path
      advancedSettings.statusMessage = 'SteamCMD executable selected. Save settings to apply it.'
    } catch (error) {
      const parsed = options.normalizeError(error)
      advancedSettings.statusMessage = `SteamCMD path selection failed (${parsed.code}): ${parsed.message}`
    }
  }

  /** Persists advanced settings to the user-data store. */
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
      const timeoutSettings = parseTimeoutSettings()
      if (!timeoutSettings) {
        return
      }
      const normalizedKey = advancedSettings.webApiKey.trim()
      const implicitEnable =
        normalizedKey.length > 0 ||
        advancedSettings.webApiEnabled ||
        (advancedSettings.hasWebApiKey && advancedSettings.secureStorageAvailable)
      const payload = await window.workshop.saveAdvancedSettings({
        webApiEnabled: implicitEnable,
        webApiKey: normalizedKey.length > 0 ? normalizedKey : undefined,
        steamCmdManualPath: advancedSettings.steamCmdManualPath,
        timeouts: timeoutSettings
      })
      applyAdvancedSettings(payload)
      isSteamCmdDetected.value = payload.steamCmdInstalled
      if (payload.steamCmdInstalled) {
        options.setStatusMessage('SteamCMD is ready.')
      } else {
        openAdvancedOptions()
        options.setStatusMessage('SteamCMD not found. Advanced options opened. Add the SteamCMD executable path.')
      }
      advancedSettings.webApiKey = ''
      advancedSettings.statusMessage = 'Settings saved.'
      scheduleSuccessStatusClear('Settings saved.')
    } catch (error) {
      const parsed = options.normalizeError(error)
      advancedSettings.statusMessage = `Settings save failed (${parsed.code}): ${parsed.message}`
    } finally {
      advancedSettings.isSaving = false
    }
  }

  /** Removes the stored Web API key and clears the key from the settings form. */
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
      scheduleSuccessStatusClear('Saved Web API key removed.')
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
    setLoginTimeoutMs,
    setStoredSessionTimeoutMs,
    setWorkshopTimeoutMs,
    toggleAdvancedOptions,
    openAdvancedOptions,
    ensureSteamCmdInstalled,
    openInstallLog,
    loadAdvancedSettings,
    pickSteamCmdManualPath,
    saveAdvancedSettings,
    clearSavedWebApiKey
  }
}
