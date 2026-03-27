/**
 * Overview: Electron main-process entrypoint for app startup, window lifecycle, and IPC wiring.
 * Responsibility: Bootstraps runtime/storage services, 
 * configures platform-specific behavior, and handles renderer requests for SteamCMD workflows and filesystem actions.
 */
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, safeStorage, shell } from 'electron'
import { dirname, extname, join } from 'node:path'
import { access, copyFile, mkdir, readFile, readdir } from 'node:fs/promises'
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
const STABLE_USER_DATA_DIR_NAME = 'workshop-manager'

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

function configureStableUserDataPath(): string {
  const stablePath = join(app.getPath('appData'), STABLE_USER_DATA_DIR_NAME)
  app.setPath('userData', stablePath)
  return stablePath
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function copyMissingTree(sourceDir: string, targetDir: string): Promise<void> {
  await mkdir(targetDir, { recursive: true })
  const entries = await readdir(sourceDir, { withFileTypes: true })
  for (const entry of entries) {
    const sourcePath = join(sourceDir, entry.name)
    const targetPath = join(targetDir, entry.name)
    if (entry.isDirectory()) {
      await copyMissingTree(sourcePath, targetPath)
      continue
    }
    if (!entry.isFile()) {
      continue
    }
    if (await pathExists(targetPath)) {
      continue
    }
    await mkdir(dirname(targetPath), { recursive: true })
    await copyFile(sourcePath, targetPath)
  }
}

async function migrateLegacyUserData(stableUserDataPath: string): Promise<void> {
  const appDataPath = app.getPath('appData')
  const legacyCandidates = [
    join(appDataPath, 'Workshop Manager', 'workshop-manager'),
    join(appDataPath, 'steam-workshop-mod-manager', 'workshop-manager'),
    join(appDataPath, 'Workshop Manager'),
    join(appDataPath, 'steam-workshop-mod-manager')
  ].filter((candidate) => candidate !== stableUserDataPath)
  let migratedAny = false
  for (const legacyPath of legacyCandidates) {
    if (!(await pathExists(legacyPath))) {
      continue
    }
    await copyMissingTree(legacyPath, stableUserDataPath)
    migratedAny = true
  }
  if (migratedAny) {
    console.log('[startup] Checked and merged legacy app data into stable userData path')
  }
}

const stableUserDataPath = configureStableUserDataPath()

function resolvePreloadPath(): string {
  const jsPath = join(__dirname, '../preload/index.js')
  if (existsSync(jsPath)) {
    return jsPath
  }
  return join(__dirname, '../preload/index.mjs')
}

function resolveWindowIconPath(): string | undefined {
  const iconCandidates =
    process.platform === 'win32'
      ? ['app-icon.ico', 'app-icon.normalized.png', 'app-icon.png']
      : ['app-icon.normalized.png', 'app-icon.png', 'app-icon.icns']
  const candidateDirs = new Set<string>()
  candidateDirs.add(join(process.cwd(), 'resources'))
  candidateDirs.add(join(app.getAppPath(), 'resources'))
  candidateDirs.add(join(__dirname, '../resources'))
  candidateDirs.add(join(__dirname, '../../resources'))
  const publicDir = process.env['VITE_PUBLIC']
  if (publicDir) {
    candidateDirs.add(publicDir)
  }

  for (const dir of candidateDirs) {
    for (const iconName of iconCandidates) {
      const iconPath = join(dir, iconName)
      if (existsSync(iconPath)) {
        return iconPath
      }
    }
  }
  return undefined
}

function toImageMimeType(path: string): string {
  const ext = extname(path).toLowerCase()
  if (ext === '.png') return 'image/png'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.gif') return 'image/gif'
  return 'application/octet-stream'
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
  const iconPath = resolveWindowIconPath()
  mainWindow = new BrowserWindow({
    width: 1050,
    height: 750,
    minWidth: 780,
    minHeight: 560,
    autoHideMenuBar: true,
    icon: iconPath,
    // Prevent white flashes during resize before renderer repaint completes.
    backgroundColor: '#171a21',
    webPreferences: {
      preload: resolvePreloadPath(),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  })

  if (iconPath) {
    mainWindow.setIcon(iconPath)
    if (process.platform === 'darwin' && app.dock) {
      app.dock.setIcon(nativeImage.createFromPath(iconPath))
    }
  }

  if (process.env['ELECTRON_RENDERER_URL']) {
    await mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    await mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
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

  const profileStore = new ProfileStore(paths.profilesPath)
  const runLogStore = new RunLogStore(paths.runLogsDir)
  const installManager = new SteamCmdInstallManager(paths.dataDir)
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
    paths.runtimeDir
  )

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
      steamCmdSource: steamCmdStatus.source
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

  ipcMain.handle(IPC_CHANNELS.getAppVersion, async () => {
    return { version: app.getVersion() }
  })

  ipcMain.handle(IPC_CHANNELS.login, async (_event, payload: LoginInput) => {
    try {
      const useStoredAuth = payload.useStoredAuth === true
      const state = await runtimeService.login(payload.username, payload.password, useStoredAuth)
      // Stored session needs username next launch, so keep username when rememberAuth is enabled.
      const rememberAuth = payload.rememberAuth === true
      const rememberUsername = payload.rememberUsername === true || rememberAuth
      await profileStore.setRememberedLoginState({
        rememberedUsername: rememberUsername ? payload.username : undefined,
        rememberAuth
      })
      return {
        ...state,
        rememberedUsername: rememberUsername ? payload.username : undefined
      }
    } catch (error) {
      throw toIpcError(error)
    }
  })

  ipcMain.handle(IPC_CHANNELS.quitApp, async () => {
    app.quit()
    return { ok: true }
  })

  ipcMain.handle(IPC_CHANNELS.logout, async () => {
    // UI sign-out should not invalidate remembered SteamCMD session.
    runtimeService.logout()
    return { ok: true }
  })

  ipcMain.handle(IPC_CHANNELS.clearStoredSession, async () => {
    try {
      // Explicit clear must invalidate SteamCMD cached auth.
      runtimeService.logout({ clearStoredAuth: true })
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
    const rememberedUsername = await profileStore.getRememberedUsername()
    const rememberAuth = await profileStore.getRememberAuth()
    const shouldCheckStoredAuth = rememberAuth && Boolean(rememberedUsername?.trim())
    return {
      profiles: await profileStore.getProfiles(),
      rememberedUsername,
      rememberAuth,
      hasStoredAuth: shouldCheckStoredAuth ? await runtimeService.hasStoredAuthFor(rememberedUsername) : false
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
      const previousSteamCmdManualPath = await profileStore.getSteamCmdManualPath()
      const previousSteamCmdManualPathValue = previousSteamCmdManualPath?.trim() ?? ''
      let nextEncryptedWebApiKey = await profileStore.getWebApiKeyEncrypted()
      let nextSteamCmdManualPath = previousSteamCmdManualPath

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
        steamCmdManualPath: nextSteamCmdManualPath
      })

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
      const storedWebApiEnabled = await profileStore.getWebApiEnabled()
      const resolvedKey = await resolveSavedWebApiKey()
      const allowWebApi = storedWebApiEnabled && resolvedKey.hasUsableKey
      if (storedWebApiEnabled !== allowWebApi) {
        await profileStore.setWebApiEnabled(allowWebApi)
      }

      return await runtimeService.getMyWorkshopItems(payload.appId, allowWebApi ? resolvedKey.key : undefined, allowWebApi)
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

  ipcMain.handle(IPC_CHANNELS.openExternal, async (_event, payload: { url: string }) => {
    try {
      const targetUrl = payload.url?.trim()
      if (!targetUrl) {
        throw new AppError('validation', 'URL is required')
      }
      await shell.openExternal(targetUrl)
      return { ok: true }
    } catch (error) {
      throw toIpcError(error)
    }
  })

  ipcMain.handle(IPC_CHANNELS.getLocalImagePreview, async (_event, payload: { path: string }) => {
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

  ipcMain.handle(IPC_CHANNELS.pickSteamCmdExecutable, async () => {
    const dialogOptions: Electron.OpenDialogOptions = {
      title: 'Select SteamCMD executable',
      properties: ['openFile']
    }
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions)
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
