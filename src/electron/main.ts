import { app, BrowserWindow, dialog, ipcMain, Menu, safeStorage, shell } from 'electron'
import { join } from 'node:path'
import { mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
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
import { AppError } from '@backend/utils/errors'
import { ProfileStore } from '@backend/stores/profile-store'
import { RunLogStore } from '@backend/stores/run-log-store'
import { SteamCmdInstallManager } from '@backend/services/steamcmd-install-manager'
import { SteamCmdRuntimeService } from '@backend/services/steamcmd-runtime-service'
import { getAppPaths } from '@backend/services/path-provider'
import { listContentFolderFiles } from '@backend/services/content-folder-scanner'

let mainWindow: BrowserWindow | null = null

if (process.env['ELECTRON_VERBOSE_LOGS'] !== '1') {
  // Hide noisy Chromium internal stderr lines (for example atom_cache copy/paste warnings).
  app.commandLine.appendSwitch('disable-logging')
  app.commandLine.appendSwitch('log-level', '3')
}

if (process.platform === 'linux') {
  // Avoid noisy GPU/VSync errors on some Linux desktop stacks.
  app.disableHardwareAcceleration()
}

function resolvePreloadPath(): string {
  const jsPath = join(__dirname, '../preload/index.js')
  if (existsSync(jsPath)) {
    return jsPath
  }
  return join(__dirname, '../preload/index.mjs')
}

function toPlainError(error: unknown): { message: string; code: string } {
  if (error instanceof AppError) {
    return { message: error.message, code: error.code }
  }
  if (error instanceof Error) {
    return { message: error.message, code: 'command_failed' }
  }
  return { message: 'Unknown error', code: 'command_failed' }
}

function toIpcError(error: unknown): Error {
  const plain = toPlainError(error)
  const wrapped = new Error(`[${plain.code}] ${plain.message}`)
  ;(wrapped as Error & { code?: string }).code = plain.code
  return wrapped
}

function isSecureStorageAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

function encryptSecret(value: string): string {
  if (!isSecureStorageAvailable()) {
    throw new AppError(
      'command_failed',
      'Secure storage is unavailable on this system. Steam Web API key cannot be saved securely.'
    )
  }
  return safeStorage.encryptString(value).toString('base64')
}

function decryptSecret(value: string): string {
  if (!isSecureStorageAvailable()) {
    throw new AppError(
      'command_failed',
      'Secure storage is unavailable on this system. Saved Steam Web API key cannot be unlocked.'
    )
  }
  try {
    return safeStorage.decryptString(Buffer.from(value, 'base64'))
  } catch {
    throw new AppError(
      'command_failed',
      'Saved Steam Web API key is unreadable. Re-enter it in Advanced Options.'
    )
  }
}

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1050,
    height: 750,
    minWidth: 780,
    minHeight: 560,
    autoHideMenuBar: true,
    // Prevent white flashes during resize before renderer repaint completes.
    backgroundColor: '#171a21',
    webPreferences: {
      preload: resolvePreloadPath(),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    await mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    await mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null)

  const paths = getAppPaths()
  await mkdir(paths.dataDir, { recursive: true })

  const profileStore = new ProfileStore(paths.profilesPath)
  const runLogStore = new RunLogStore(paths.runLogsDir)
  const installManager = new SteamCmdInstallManager(paths.dataDir)
  const runtimeService = new SteamCmdRuntimeService(
    async () => {
      const status = await installManager.getStatus()
      if (!status.installed) {
        throw new AppError('install', 'SteamCMD is not installed yet')
      }
      return status.executablePath
    },
    runLogStore,
    paths.runtimeDir
  )

  const getAdvancedSettings = async (): Promise<AdvancedSettings> => {
    const encryptedKey = await profileStore.getWebApiKeyEncrypted()
    return {
      webApiEnabled: await profileStore.getWebApiEnabled(),
      hasWebApiKey: Boolean(encryptedKey && encryptedKey.trim().length > 0),
      secureStorageAvailable: isSecureStorageAvailable()
    }
  }

  runtimeService.on('run-event', (event) => {
    if (!mainWindow) {
      return
    }
    mainWindow.webContents.send(IPC_CHANNELS.runEvent, event)
  })

  ipcMain.handle(IPC_CHANNELS.ensureSteamCmdInstalled, async () => {
    try {
      return await installManager.ensureInstalled()
    } catch (error) {
      throw toIpcError(error)
    }
  })

  ipcMain.handle(IPC_CHANNELS.login, async (_event, payload: LoginInput) => {
    try {
      const useStoredAuth = payload.useStoredAuth === true
      const state = await runtimeService.login(payload.username, payload.password, useStoredAuth)
      const rememberUsername = payload.rememberUsername === true
      const rememberAuth = rememberUsername && payload.rememberAuth === true
      await profileStore.setRememberedUsername(rememberUsername ? payload.username : undefined)
      await profileStore.setRememberAuth(rememberAuth)
      return {
        ...state,
        rememberedUsername: rememberUsername ? payload.username : undefined
      }
    } catch (error) {
      throw toIpcError(error)
    }
  })

  ipcMain.handle(IPC_CHANNELS.logout, async () => {
    runtimeService.logout()
    return { ok: true }
  })

  ipcMain.handle(IPC_CHANNELS.clearStoredSession, async () => {
    try {
      runtimeService.logout()
      await profileStore.setRememberAuth(false)
      return { ok: true }
    } catch (error) {
      throw toIpcError(error)
    }
  })

  ipcMain.handle(IPC_CHANNELS.submitSteamGuardCode, async (_event, payload: SteamGuardInput) => {
    try {
      runtimeService.submitSteamGuardCode(payload.sessionId, payload.code)
      return { ok: true }
    } catch (error) {
      throw toIpcError(error)
    }
  })

  ipcMain.handle(IPC_CHANNELS.uploadMod, async (_event, payload: UploadInput) => {
    try {
      return await runtimeService.upload(payload.draft, 'upload')
    } catch (error) {
      throw toIpcError(error)
    }
  })

  ipcMain.handle(IPC_CHANNELS.updateMod, async (_event, payload: UploadInput) => {
    try {
      return await runtimeService.upload(payload.draft, 'update')
    } catch (error) {
      throw toIpcError(error)
    }
  })

  ipcMain.handle(IPC_CHANNELS.updateVisibility, async (_event, payload: VisibilityUpdateInput) => {
    try {
      return await runtimeService.upload(
        {
          appId: payload.appId,
          publishedFileId: payload.publishedFileId,
          contentFolder: '',
          previewFile: '',
          title: '',
          description: '',
          tags: [],
          visibility: payload.visibility
        },
        'visibility'
      )
    } catch (error) {
      throw toIpcError(error)
    }
  })

  ipcMain.handle(IPC_CHANNELS.getProfiles, async () => {
    return {
      profiles: await profileStore.getProfiles(),
      rememberedUsername: await profileStore.getRememberedUsername(),
      rememberAuth: await profileStore.getRememberAuth()
    }
  })

  ipcMain.handle(IPC_CHANNELS.getAdvancedSettings, async () => {
    try {
      return await getAdvancedSettings()
    } catch (error) {
      throw toIpcError(error)
    }
  })

  ipcMain.handle(IPC_CHANNELS.saveAdvancedSettings, async (_event, payload: SaveAdvancedSettingsInput) => {
    try {
      let nextWebApiEnabled = payload.webApiEnabled === true

      if (payload.clearWebApiKey === true) {
        await profileStore.setWebApiKeyEncrypted(undefined)
        nextWebApiEnabled = false
      }

      const normalizedKey = payload.webApiKey?.trim()
      if (normalizedKey && normalizedKey.length > 0) {
        const encrypted = encryptSecret(normalizedKey)
        await profileStore.setWebApiKeyEncrypted(encrypted)
        nextWebApiEnabled = true
      }

      await profileStore.setWebApiEnabled(nextWebApiEnabled)

      return await getAdvancedSettings()
    } catch (error) {
      throw toIpcError(error)
    }
  })

  ipcMain.handle(IPC_CHANNELS.saveProfile, async (_event, payload: { profile: ModProfile }) => {
    try {
      return await profileStore.saveProfile(payload.profile)
    } catch (error) {
      throw toIpcError(error)
    }
  })

  ipcMain.handle(IPC_CHANNELS.deleteProfile, async (_event, payload: { profileId: string }) => {
    try {
      await profileStore.deleteProfile(payload.profileId)
      return { ok: true }
    } catch (error) {
      throw toIpcError(error)
    }
  })

  ipcMain.handle(IPC_CHANNELS.getRunLogs, async () => {
    return await runLogStore.list()
  })

  ipcMain.handle(IPC_CHANNELS.getRunLog, async (_event, payload: { runId: string }) => {
    return await runLogStore.get(payload.runId)
  })

  ipcMain.handle(IPC_CHANNELS.getCurrentProfile, async () => {
    try {
      return await runtimeService.getCurrentProfile()
    } catch (error) {
      throw toIpcError(error)
    }
  })

  ipcMain.handle(IPC_CHANNELS.getMyWorkshopItems, async (_event, payload: { appId?: string }) => {
    try {
      const webApiEnabled = await profileStore.getWebApiEnabled()
      let savedWebApiKey: string | undefined
      if (webApiEnabled) {
        const encrypted = await profileStore.getWebApiKeyEncrypted()
        if (encrypted && encrypted.trim().length > 0) {
          try {
            savedWebApiKey = decryptSecret(encrypted)
          } catch {
            savedWebApiKey = undefined
          }
        }
      }
      return await runtimeService.getMyWorkshopItems(payload.appId, savedWebApiKey, webApiEnabled)
    } catch (error) {
      throw toIpcError(error)
    }
  })

  ipcMain.handle(IPC_CHANNELS.listContentFolderFiles, async (_event, payload: { folderPath: string }) => {
    try {
      return await listContentFolderFiles(payload.folderPath)
    } catch (error) {
      throw toIpcError(error)
    }
  })

  ipcMain.handle(IPC_CHANNELS.openPath, async (_event, payload: { path: string }) => {
    try {
      const targetPath = payload.path?.trim()
      if (!targetPath) {
        throw new AppError('validation', 'Path is required')
      }
      const openError = await shell.openPath(targetPath)
      return openError ? { ok: true, error: openError } : { ok: true }
    } catch (error) {
      throw toIpcError(error)
    }
  })

  ipcMain.handle(IPC_CHANNELS.pickFolder, async () => {
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] })
      : await dialog.showOpenDialog({ properties: ['openDirectory'] })
    return result.filePaths[0]
  })

  ipcMain.handle(IPC_CHANNELS.pickFile, async () => {
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, {
          properties: ['openFile'],
          filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
        })
      : await dialog.showOpenDialog({
          properties: ['openFile'],
          filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
        })
    return result.filePaths[0]
  })

  ipcMain.handle(IPC_CHANNELS.pickFiles, async () => {
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, {
          properties: ['openFile', 'multiSelections']
        })
      : await dialog.showOpenDialog({
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
