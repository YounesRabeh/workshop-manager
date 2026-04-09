/**
 * Overview: Electron main-process entrypoint for app startup, window lifecycle, and IPC wiring.
 * Responsibility: Bootstraps runtime/storage services,
 * configures platform-specific behavior, and handles renderer requests for SteamCMD workflows and filesystem actions.
 */
import { app, BrowserWindow, dialog, Menu, shell } from 'electron'
import { extname } from 'node:path'
import { mkdir, readFile } from 'node:fs/promises'
import { IPC_CHANNELS } from '@shared/ipc'
import type {
  AdvancedSettings,
  LoginInput,
  ModProfile,
  SaveAdvancedSettingsInput,
  SteamGuardInput,
  UploadInput,
  VisibilityUpdateInput
} from '@shared/contracts'
import { normalizeSteamCmdTimeoutSettings } from '@shared/runtime-settings'
import { AppError } from '@backend/utils/errors'
import { ProfileStore } from '@backend/stores/profile-store'
import { RunLogStore } from '@backend/stores/run-log-store'
import { SteamCmdInstallManager } from '@backend/services/steamcmd-install-manager'
import { resolveSteamCmdPlatformProfile } from '@backend/services/steamcmd-platform-profile'
import { SteamCmdRuntimeService } from '@backend/services/steamcmd-runtime-service'
import { getAppPaths } from '@backend/services/path-provider'
import { listContentFolderFiles } from '@backend/services/content-folder-scanner'
import { createMainWindow } from './main-window'
import { decryptSecret, encryptSecret, isSecureStorageAvailable } from './secret-store'
import { handleIpc } from './ipc-helpers'
import { configureStableUserDataPath, migrateLegacyUserData } from './user-data-migration'

let mainWindow: BrowserWindow | null = null

if (process.env['ELECTRON_VERBOSE_LOGS'] !== '1') {
  // Hide noisy Chromium internal stderr lines (for example atom_cache copy/paste warnings).
  app.commandLine.appendSwitch('disable-logging')
  app.commandLine.appendSwitch('log-level', '3')
}

if (process.platform === 'linux') {
  process.env['CHROME_DESKTOP'] ??= 'workshop-manager.desktop'
  // Avoid noisy GPU/VSync errors on some Linux desktop stacks.
  app.disableHardwareAcceleration()
  // Helps Linux shells match the running window to this app identity instead of generic Electron.
  app.commandLine.appendSwitch('class', 'workshop-manager')
  app.commandLine.appendSwitch('name', 'workshop-manager')
}

const stableUserDataPath = configureStableUserDataPath()

function toImageMimeType(path: string): string {
  const ext = extname(path).toLowerCase()
  if (ext === '.png') return 'image/png'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.gif') return 'image/gif'
  return 'application/octet-stream'
}

async function showOpenDialog(
  dialogOptions: Electron.OpenDialogOptions
): Promise<Electron.OpenDialogReturnValue> {
  if (mainWindow) {
    return await dialog.showOpenDialog(mainWindow, dialogOptions)
  }
  return await dialog.showOpenDialog(dialogOptions)
}

async function createWindow(): Promise<void> {
  mainWindow = await createMainWindow()
}

app.whenReady().then(async () => {
  await migrateLegacyUserData(stableUserDataPath)

  if (process.platform === 'linux') {
    app.setName('Workshop Manager')
    const linuxApp = app as Electron.App & { setDesktopName?: (desktopFileName: string) => void }
    linuxApp.setDesktopName?.('workshop-manager.desktop')
  }

  Menu.setApplicationMenu(null)

  const paths = getAppPaths()
  await mkdir(paths.dataDir, { recursive: true })
  const steamCmdPlatformProfile = resolveSteamCmdPlatformProfile()

  const profileStore = new ProfileStore(paths.profilesPath)
  const runLogStore = new RunLogStore(paths.runLogsDir)
  const installManager = new SteamCmdInstallManager(paths.dataDir, steamCmdPlatformProfile)
  installManager.setManualExecutablePath(await profileStore.getSteamCmdManualPath())
  const runtimeService = new SteamCmdRuntimeService(
    async () => {
      const status = await installManager.getStatus()
      if (!status.installed) {
        throw new AppError('install', 'SteamCMD is not installed yet')
      }
      return status.executablePath
    },
    runLogStore,
    paths.runtimeDir,
    steamCmdPlatformProfile
  )
  runtimeService.setTimeoutSettings(await profileStore.getTimeoutSettings())

  const resolveSavedWebApiKey = async (): Promise<{
    key?: string
    hasUsableKey: boolean
    secureStorageAvailable: boolean
  }> => {
    const encryptedKey = await profileStore.getWebApiKeyEncrypted()
    const secureStorageAvailable = isSecureStorageAvailable()
    if (!encryptedKey || encryptedKey.trim().length === 0 || !secureStorageAvailable) {
      return {
        hasUsableKey: false,
        secureStorageAvailable
      }
    }

    try {
      const key = decryptSecret(encryptedKey).trim()
      if (!key) {
        return {
          hasUsableKey: false,
          secureStorageAvailable
        }
      }
      return {
        key,
        hasUsableKey: true,
        secureStorageAvailable
      }
    } catch {
      return {
        hasUsableKey: false,
        secureStorageAvailable
      }
    }
  }

  const getAdvancedSettings = async (): Promise<AdvancedSettings> => {
    const storedWebApiEnabled = await profileStore.getWebApiEnabled()
    const resolvedKey = await resolveSavedWebApiKey()
    const steamCmdManualPath = await profileStore.getSteamCmdManualPath()
    const steamCmdStatus = await installManager.getStatus()
    const timeoutSettings = await profileStore.getTimeoutSettings()
    const effectiveWebApiEnabled = storedWebApiEnabled && resolvedKey.hasUsableKey
    if (storedWebApiEnabled !== effectiveWebApiEnabled) {
      await profileStore.setWebApiEnabled(effectiveWebApiEnabled)
    }

    return {
      webApiEnabled: effectiveWebApiEnabled,
      hasWebApiKey: resolvedKey.hasUsableKey,
      secureStorageAvailable: resolvedKey.secureStorageAvailable,
      steamCmdManualPath,
      steamCmdInstalled: steamCmdStatus.installed,
      steamCmdSource: steamCmdStatus.source,
      timeouts: timeoutSettings
    }
  }

  runtimeService.on('run-event', (event) => {
    if (!mainWindow) {
      return
    }
    mainWindow.webContents.send(IPC_CHANNELS.runEvent, event)
  })

  handleIpc(IPC_CHANNELS.ensureSteamCmdInstalled, async () => {
    return await installManager.ensureInstalled()
  })

  handleIpc(IPC_CHANNELS.getAppVersion, async () => {
    return { version: app.getVersion() }
  })

  handleIpc(IPC_CHANNELS.login, async (payload: LoginInput) => {
    const useStoredAuth = payload.useStoredAuth === true
    const rememberAuth = payload.rememberAuth === true
    const rememberUsername = payload.rememberUsername === true || rememberAuth
    const preferredAuthMode = payload.preferredAuthMode === 'steam_guard_mobile' ? 'steam_guard_mobile' : 'otp'
    await profileStore.setRememberedLoginState({
      rememberedUsername: rememberUsername ? payload.username : undefined,
      rememberAuth,
      preferredAuthMode
    })
    const state = await runtimeService.login(payload.username, payload.password, useStoredAuth)
    // Stored session needs username next launch, so keep username when rememberAuth is enabled.
    await profileStore.setRememberedLoginState({
      rememberedUsername: rememberUsername ? payload.username : undefined,
      rememberAuth,
      preferredAuthMode
    })
    return {
      ...state,
      rememberedUsername: rememberUsername ? payload.username : undefined
    }
  })

  handleIpc(IPC_CHANNELS.quitApp, async () => {
    app.quit()
    return { ok: true }
  })

  handleIpc(IPC_CHANNELS.logout, async () => {
    // UI sign-out should not invalidate remembered SteamCMD session.
    runtimeService.logout()
    return { ok: true }
  })

  handleIpc(IPC_CHANNELS.clearStoredSession, async () => {
    // Explicit clear must invalidate SteamCMD cached auth.
    runtimeService.logout({ clearStoredAuth: true })
    await profileStore.setRememberAuth(false)
    return { ok: true }
  })

  handleIpc(IPC_CHANNELS.submitSteamGuardCode, async (payload: SteamGuardInput) => {
    runtimeService.submitSteamGuardCode(payload.sessionId, payload.code)
    return { ok: true }
  })

  handleIpc(IPC_CHANNELS.uploadMod, async (payload: UploadInput) => {
    return await runtimeService.upload(payload.draft, 'upload')
  })

  handleIpc(IPC_CHANNELS.updateMod, async (payload: UploadInput) => {
    return await runtimeService.upload(payload.draft, 'update')
  })

  handleIpc(IPC_CHANNELS.updateVisibility, async (payload: VisibilityUpdateInput) => {
    return await runtimeService.upload(
      {
        appId: payload.appId,
        publishedFileId: payload.publishedFileId,
        contentFolder: '',
        previewFile: '',
        title: '',
        visibility: payload.visibility
      },
      'visibility'
    )
  })

  handleIpc(IPC_CHANNELS.getProfiles, async () => {
    const rememberedUsername = await profileStore.getRememberedUsername()
    const rememberAuth = await profileStore.getRememberAuth()
    const preferredAuthMode = await profileStore.getPreferredAuthMode()
    const shouldCheckStoredAuth = rememberAuth && Boolean(rememberedUsername?.trim())
    return {
      profiles: await profileStore.getProfiles(),
      rememberedUsername,
      rememberAuth,
      hasStoredAuth: shouldCheckStoredAuth ? await runtimeService.hasStoredAuthFor(rememberedUsername) : false,
      preferredAuthMode
    }
  })

  handleIpc(IPC_CHANNELS.getAdvancedSettings, async () => {
    return await getAdvancedSettings()
  })

  handleIpc(IPC_CHANNELS.getInstallLog, async () => {
    return await installManager.getInstallLog()
  })

  handleIpc(IPC_CHANNELS.saveAdvancedSettings, async (payload: SaveAdvancedSettingsInput) => {
    let nextWebApiEnabled = payload.webApiEnabled === true
    const previousSteamCmdManualPath = await profileStore.getSteamCmdManualPath()
    const previousSteamCmdManualPathValue = previousSteamCmdManualPath?.trim() ?? ''
    let nextEncryptedWebApiKey = await profileStore.getWebApiKeyEncrypted()
    let nextSteamCmdManualPath = previousSteamCmdManualPath
    const currentTimeoutSettings = await profileStore.getTimeoutSettings()
    const nextTimeoutSettings = normalizeSteamCmdTimeoutSettings({
      ...currentTimeoutSettings,
      ...payload.timeouts
    })

    if (payload.clearWebApiKey === true) {
      nextEncryptedWebApiKey = undefined
      nextWebApiEnabled = false
    }

    const normalizedKey = payload.webApiKey?.trim()
    if (normalizedKey && normalizedKey.length > 0) {
      nextEncryptedWebApiKey = encryptSecret(normalizedKey)
      nextWebApiEnabled = true
    }

    if (payload.steamCmdManualPath !== undefined) {
      const normalizedSteamCmdPath = payload.steamCmdManualPath.trim()
      nextSteamCmdManualPath = normalizedSteamCmdPath.length > 0 ? normalizedSteamCmdPath : undefined
    }

    installManager.setManualExecutablePath(nextSteamCmdManualPath)

    const nextSteamCmdManualPathValue = nextSteamCmdManualPath?.trim() ?? ''
    if (nextSteamCmdManualPath && nextSteamCmdManualPathValue !== previousSteamCmdManualPathValue) {
      const installStatus = await installManager.getStatus()
      if (!installStatus.installed || installStatus.source !== 'manual') {
        installManager.setManualExecutablePath(previousSteamCmdManualPath)
        throw new AppError('install', 'Selected SteamCMD path is not a usable executable.')
      }
    }

    await profileStore.setAdvancedSettingsState({
      webApiEnabled: nextWebApiEnabled,
      webApiKeyEncrypted: nextEncryptedWebApiKey,
      steamCmdManualPath: nextSteamCmdManualPath,
      timeoutSettings: nextTimeoutSettings
    })
    runtimeService.setTimeoutSettings(nextTimeoutSettings)

    return await getAdvancedSettings()
  })

  handleIpc(IPC_CHANNELS.saveProfile, async (payload: { profile: ModProfile }) => {
    return await profileStore.saveProfile(payload.profile)
  })

  handleIpc(IPC_CHANNELS.deleteProfile, async (payload: { profileId: string }) => {
    await profileStore.deleteProfile(payload.profileId)
    return { ok: true }
  })

  handleIpc(IPC_CHANNELS.getRunLogs, async () => {
    return await runLogStore.list()
  })

  handleIpc(IPC_CHANNELS.getRunLog, async (payload: { runId: string }) => {
    return await runLogStore.get(payload.runId)
  })

  handleIpc(IPC_CHANNELS.getCurrentProfile, async () => {
    return await runtimeService.getCurrentProfile()
  })

  handleIpc(IPC_CHANNELS.getMyWorkshopItems, async (payload: { appId?: string }) => {
    const encryptedKey = await profileStore.getWebApiKeyEncrypted()
    const storedWebApiEnabled = await profileStore.getWebApiEnabled()
    const resolvedKey = await resolveSavedWebApiKey()
    const allowWebApi = storedWebApiEnabled && resolvedKey.hasUsableKey
    const webApiAccess =
      allowWebApi
        ? 'active'
        : encryptedKey?.trim()
          ? 'configured_unavailable'
          : 'disabled'
    if (storedWebApiEnabled !== allowWebApi) {
      await profileStore.setWebApiEnabled(allowWebApi)
    }

    return await runtimeService.getMyWorkshopItems(payload.appId, allowWebApi ? resolvedKey.key : undefined, {
      allowWebApi,
      webApiAccess
    })
  })

  handleIpc(IPC_CHANNELS.listContentFolderFiles, async (payload: { folderPath: string }) => {
    return await listContentFolderFiles(payload.folderPath)
  })

  handleIpc(IPC_CHANNELS.openPath, async (payload: { path: string }) => {
    const targetPath = payload.path?.trim()
    if (!targetPath) {
      throw new AppError('validation', 'Path is required')
    }
    const openError = await shell.openPath(targetPath)
    return openError ? { ok: true, error: openError } : { ok: true }
  })

  handleIpc(IPC_CHANNELS.openExternal, async (payload: { url: string }) => {
    const targetUrl = payload.url?.trim()
    if (!targetUrl) {
      throw new AppError('validation', 'URL is required')
    }
    await shell.openExternal(targetUrl)
    return { ok: true }
  })

  handleIpc(IPC_CHANNELS.getLocalImagePreview, async (payload: { path: string }) => {
    const targetPath = payload.path?.trim()
    if (!targetPath) {
      return undefined
    }

    try {
      const bytes = await readFile(targetPath)
      const mime = toImageMimeType(targetPath)
      return `data:${mime};base64,${bytes.toString('base64')}`
    } catch {
      return undefined
    }
  })

  handleIpc(IPC_CHANNELS.pickFolder, async () => {
    const result = await showOpenDialog({ properties: ['openDirectory'] })
    return result.filePaths[0]
  })

  handleIpc(IPC_CHANNELS.pickFile, async () => {
    const result = await showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
    })
    return result.filePaths[0]
  })

  handleIpc(IPC_CHANNELS.pickSteamCmdExecutable, async () => {
    const result = await showOpenDialog({
      title: 'Select SteamCMD executable',
      properties: ['openFile']
    })
    return result.filePaths[0]
  })

  handleIpc(IPC_CHANNELS.pickFiles, async () => {
    const result = await showOpenDialog({
      properties: ['openFile', 'multiSelections']
    })
    return result.filePaths
  })

  await createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
