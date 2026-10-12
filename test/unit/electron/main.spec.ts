import { beforeAll, describe, expect, it, vi } from 'vitest'
import { app, dialog, shell } from 'electron'
import { TEST_ACCOUNT, TEST_APP_VERSION, TEST_WORKSHOP, createUploadDraft } from '../../fixtures/workshop-seed'

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  const profileStore = {
    getProfiles: vi.fn(async () => []),
    getSteamCmdManualPath: vi.fn(async () => undefined),
    getTimeoutSettings: vi.fn(async () => ({ loginTimeoutMs: 60_000, storedSessionTimeoutMs: 10_000, workshopTimeoutMs: 60_000 })),
    getRememberAuth: vi.fn(async () => true),
    getRememberedUsername: vi.fn(async () => TEST_ACCOUNT.username),
    getPreferredAuthMode: vi.fn(async () => 'otp'),
    getWebApiKeyEncrypted: vi.fn(async () => 'encrypted-key'),
    getWebApiEnabled: vi.fn(async () => true),
    setWebApiEnabled: vi.fn(async () => undefined),
    setRememberedLoginState: vi.fn(async () => undefined),
    setRememberAuth: vi.fn(async () => undefined),
    setPreferredAuthMode: vi.fn(async () => undefined),
    setAdvancedSettingsState: vi.fn(async () => undefined),
    saveProfile: vi.fn(async (profile: unknown) => profile),
    deleteProfile: vi.fn(async () => undefined)
  }
  const runtime = {
    on: vi.fn(),
    purgeStaleScriptArtifacts: vi.fn(async () => undefined),
    setTimeoutSettings: vi.fn(),
    clearAuthCacheForStrictLogin: vi.fn(async () => undefined),
    login: vi.fn(async () => ({ sessionId: 'session-1' })),
    logout: vi.fn(),
    submitSteamGuardCode: vi.fn(),
    upload: vi.fn(async () => ({ success: true })),
    hasStoredAuthFor: vi.fn(async () => true),
    getCurrentProfile: vi.fn(async () => ({ steamId64: '1', profileUrl: 'https://steamcommunity.com/profiles/1' })),
    getMyWorkshopItems: vi.fn(async () => []),
    getMyWorkshopItemsPage: vi.fn(async (input: unknown) => ({ items: [], ...(input as object), hasNext: false }))
  }
  const installManager = {
    setManualExecutablePath: vi.fn(),
    getStatus: vi.fn(async () => ({ installed: true, executablePath: '/steamcmd', source: 'auto' })),
    ensureInstalled: vi.fn(async () => ({ installed: true, executablePath: '/steamcmd', source: 'auto' })),
    getInstallLog: vi.fn(async () => ({ path: '/log', content: '', exists: true }))
  }
  const secretStore = {
    decryptSecret: vi.fn((): string => TEST_ACCOUNT.apiKey),
    encryptSecret: vi.fn(() => 'encrypted-new-key'),
    isSecureStorageAvailable: vi.fn(() => true)
  }
  return { handlers, profileStore, runtime, installManager, secretStore }
})

vi.mock('electron', () => ({
  app: {
    commandLine: { appendSwitch: vi.fn() },
    disableHardwareAcceleration: vi.fn(),
    whenReady: vi.fn(() => Promise.resolve()),
    on: vi.fn(),
    setName: vi.fn(),
    setDesktopName: vi.fn(),
    getVersion: vi.fn(() => TEST_APP_VERSION),
    quit: vi.fn(),
    exit: vi.fn()
  },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
  dialog: { showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] })), showErrorBox: vi.fn() },
  Menu: { setApplicationMenu: vi.fn() },
  shell: { openPath: vi.fn(async () => ''), openExternal: vi.fn(async () => undefined) }
}))
vi.mock('node:fs/promises', () => ({ mkdir: vi.fn(async () => undefined) }))
vi.mock('@backend/stores/profile-store', () => ({ ProfileStore: vi.fn(function () { return mocks.profileStore }) }))
vi.mock('@backend/stores/run-log-store', () => ({
  RunLogStore: vi.fn(function () { return { list: vi.fn(async () => []), get: vi.fn(async () => null) } })
}))
vi.mock('@backend/services/steamcmd/install-manager', () => ({ SteamCmdInstallManager: vi.fn(function () { return mocks.installManager }) }))
vi.mock('@backend/services/steamcmd/runtime-service', () => ({ SteamCmdRuntimeService: vi.fn(function () { return mocks.runtime }) }))
vi.mock('@backend/services/steamcmd/platform-profile', () => ({ resolveSteamCmdPlatformProfile: vi.fn(() => 'linux') }))
vi.mock('@backend/services/app/path-provider', () => ({
  getAppPaths: vi.fn(() => ({ dataDir: '/data', profilesPath: '/data/profiles.json', runLogsDir: '/data/logs', runtimeDir: '/data/runtime' }))
}))
vi.mock('@backend/services/workshop/content-folder-scanner', () => ({ listContentFolderFiles: vi.fn(async () => []) }))
vi.mock('@backend/services/workshop/preview-validator', () => ({ validateWorkshopPreviewFile: vi.fn(async () => undefined) }))
vi.mock('../../../src/electron/main-window', () => ({
  createMainWindow: vi.fn(async () => ({ webContents: { send: vi.fn() } }))
}))
vi.mock('../../../src/electron/secret-store', () => ({
  decryptSecret: mocks.secretStore.decryptSecret,
  encryptSecret: mocks.secretStore.encryptSecret,
  isSecureStorageAvailable: mocks.secretStore.isSecureStorageAvailable
}))
vi.mock('../../../src/electron/ipc-helpers', () => ({
  handleIpc: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => mocks.handlers.set(channel, handler))
}))
vi.mock('../../../src/electron/ipc-security', () => ({
  isSafeExternalUrl: vi.fn((url: string) => /^https?:/.test(url)),
  LocalImagePreviewAccess: vi.fn(function () { return { approve: vi.fn(async () => true), load: vi.fn(async () => undefined) } })
}))
vi.mock('../../../src/electron/user-data-migration', () => ({
  configureStableUserDataPath: vi.fn(() => '/data'),
  migrateLegacyUserData: vi.fn(async () => undefined)
}))

describe('Electron main-process wiring', () => {
  beforeAll(async () => {
    await import('../../../src/electron/main')
    await vi.waitFor(() => expect(mocks.handlers.has('workshop:getMyWorkshopItemsPage')).toBe(true))
  })

  it('registers the critical IPC surface', () => {
    expect([...mocks.handlers.keys()]).toEqual(expect.arrayContaining([
      'workshop:login',
      'workshop:uploadMod',
      'workshop:updateMod',
      'workshop:getMyWorkshopItemsPage',
      'workshop:openExternal'
    ]))
  })

  it('delegates installation, version, authentication and profile queries', async () => {
    await expect(mocks.handlers.get('workshop:ensureSteamCmdInstalled')!()).resolves.toMatchObject({ installed: true })
    expect(mocks.installManager.ensureInstalled).toHaveBeenCalledTimes(1)
    await expect(mocks.handlers.get('workshop:getAppVersion')!()).resolves.toEqual({ version: TEST_APP_VERSION })
    await expect(mocks.handlers.get('workshop:getProfiles')!()).resolves.toMatchObject({
      profiles: [], rememberedUsername: TEST_ACCOUNT.username, rememberAuth: true, hasStoredAuth: true, preferredAuthMode: 'otp'
    })
    expect(mocks.runtime.hasStoredAuthFor).toHaveBeenCalledWith(TEST_ACCOUNT.username)
    await expect(mocks.handlers.get('workshop:getCurrentProfile')!()).resolves.toMatchObject({ steamId64: '1' })
    await mocks.handlers.get('workshop:logout')!()
    expect(mocks.runtime.logout).toHaveBeenCalledTimes(1)
    await mocks.handlers.get('workshop:quitApp')!()
    expect(app.quit).toHaveBeenCalledTimes(1)
  })

  it('delegates saved profiles and run logs', async () => {
    const profile = { id: 'profile-1', title: 'Saved' }
    await expect(mocks.handlers.get('workshop:saveProfile')!({ profile })).resolves.toEqual(profile)
    expect(mocks.profileStore.saveProfile).toHaveBeenCalledWith(profile)
    await expect(mocks.handlers.get('workshop:deleteProfile')!({ profileId: profile.id })).resolves.toEqual({ ok: true })
    expect(mocks.profileStore.deleteProfile).toHaveBeenCalledWith(profile.id)
    await expect(mocks.handlers.get('workshop:getRunLogs')!()).resolves.toEqual([])
    await expect(mocks.handlers.get('workshop:getRunLog')!({ runId: 'run-1' })).resolves.toBeNull()
    await expect(mocks.handlers.get('workshop:getInstallLog')!()).resolves.toEqual({ path: '/log', content: '', exists: true })
  })

  it('normalizes authentication preference and forwards Steam Guard codes', async () => {
    await mocks.handlers.get('workshop:savePreferredAuthMode')!({ preferredAuthMode: 'unexpected' })
    expect(mocks.profileStore.setPreferredAuthMode).toHaveBeenLastCalledWith('otp')
    await mocks.handlers.get('workshop:savePreferredAuthMode')!({ preferredAuthMode: 'steam_guard_mobile' })
    expect(mocks.profileStore.setPreferredAuthMode).toHaveBeenLastCalledWith('steam_guard_mobile')
    await mocks.handlers.get('workshop:submitSteamGuardCode')!({ sessionId: 'session-1', code: '12345' })
    expect(mocks.runtime.submitSteamGuardCode).toHaveBeenCalledWith('session-1', '12345')
  })

  it('uses update and visibility modes without requiring upload content', async () => {
    const draft = createUploadDraft()
    await mocks.handlers.get('workshop:updateMod')!({ draft })
    expect(mocks.runtime.upload).toHaveBeenLastCalledWith(draft, 'update')
    await mocks.handlers.get('workshop:updateVisibility')!({ appId: '480', publishedFileId: '123', visibility: 2 })
    expect(mocks.runtime.upload).toHaveBeenLastCalledWith({
      appId: '480', publishedFileId: '123', visibility: 2, contentFolder: '', previewFile: '', title: ''
    }, 'visibility')
  })

  it('reports advanced settings and disables an absent, blank or unreadable API key', async () => {
    const handler = mocks.handlers.get('workshop:getAdvancedSettings')!
    await expect(handler()).resolves.toMatchObject({ webApiEnabled: true, hasWebApiKey: true, steamCmdInstalled: true })
    mocks.profileStore.getWebApiKeyEncrypted.mockResolvedValueOnce('')
    await expect(handler()).resolves.toMatchObject({ webApiEnabled: false, hasWebApiKey: false })
    mocks.secretStore.decryptSecret.mockReturnValueOnce(' ')
    await expect(handler()).resolves.toMatchObject({ webApiEnabled: false, hasWebApiKey: false })
    mocks.secretStore.decryptSecret.mockImplementationOnce(() => { throw new Error('decryption failed') })
    await expect(handler()).resolves.toMatchObject({ webApiEnabled: false, hasWebApiKey: false })
  })

  it('encrypts a trimmed API key and persists normalized settings', async () => {
    await mocks.handlers.get('workshop:saveAdvancedSettings')!({ webApiKey: ' new-key ', steamCmdManualPath: '', timeouts: { loginTimeoutMs: 9000 } })
    expect(mocks.secretStore.encryptSecret).toHaveBeenCalledWith('new-key')
    expect(mocks.profileStore.setAdvancedSettingsState).toHaveBeenLastCalledWith({
      webApiEnabled: true, webApiKeyEncrypted: 'encrypted-new-key', steamCmdManualPath: undefined,
      timeoutSettings: { loginTimeoutMs: 9000, storedSessionTimeoutMs: 10000, workshopTimeoutMs: 60000 }
    })
    await mocks.handlers.get('workshop:saveAdvancedSettings')!({ clearWebApiKey: true })
    expect(mocks.profileStore.setAdvancedSettingsState).toHaveBeenLastCalledWith(expect.objectContaining({ webApiEnabled: false, webApiKeyEncrypted: undefined }))
  })

  it('rolls back an unusable manual SteamCMD path', async () => {
    mocks.installManager.getStatus.mockResolvedValueOnce({ installed: false, executablePath: '/bad', source: 'missing' })
    await expect(mocks.handlers.get('workshop:saveAdvancedSettings')!({ steamCmdManualPath: '/bad' })).rejects.toMatchObject({ code: 'install' })
    expect(mocks.installManager.setManualExecutablePath).toHaveBeenLastCalledWith(undefined)
  })

  it('validates external URLs and local paths before opening them', async () => {
    const openExternal = mocks.handlers.get('workshop:openExternal')!
    await expect(openExternal({ url: 'javascript:alert(1)' })).rejects.toMatchObject({ code: 'validation' })
    await expect(openExternal({ url: '  ' })).rejects.toMatchObject({ code: 'validation' })
    await expect(openExternal({ url: ' https://steamcommunity.com ' })).resolves.toEqual({ ok: true })
    expect(shell.openExternal).toHaveBeenCalledWith('https://steamcommunity.com')
    const openPath = mocks.handlers.get('workshop:openPath')!
    await expect(openPath({ path: ' ' })).rejects.toMatchObject({ code: 'validation' })
    await expect(openPath({ path: ' /content ' })).resolves.toEqual({ ok: true })
    expect(shell.openPath).toHaveBeenCalledWith('/content')
    vi.mocked(shell.openPath).mockResolvedValueOnce('permission denied')
    await expect(openPath({ path: '/content' })).resolves.toEqual({ ok: true, error: 'permission denied' })
  })

  it('returns canceled picker results and preserves folder and multi-file selections', async () => {
    await expect(mocks.handlers.get('workshop:pickFile')!()).resolves.toBeUndefined()
    vi.mocked(dialog.showOpenDialog).mockResolvedValueOnce({ canceled: false, filePaths: ['/content'] })
    await expect(mocks.handlers.get('workshop:pickFolder')!()).resolves.toBe('/content')
    vi.mocked(dialog.showOpenDialog).mockResolvedValueOnce({ canceled: false, filePaths: ['/steamcmd'] })
    await expect(mocks.handlers.get('workshop:pickSteamCmdExecutable')!()).resolves.toBe('/steamcmd')
    vi.mocked(dialog.showOpenDialog).mockResolvedValueOnce({ canceled: false, filePaths: ['/a', '/b'] })
    await expect(mocks.handlers.get('workshop:pickFiles')!()).resolves.toEqual(['/a', '/b'])
  })

  it('passes paged workshop requests through with the main-process secret', async () => {
    const payload = { appId: TEST_WORKSHOP.appId, page: 2, pageSize: 12, visibility: 'public' }
    const handler = mocks.handlers.get('workshop:getMyWorkshopItemsPage')!

    await handler(payload)

    expect(mocks.runtime.getMyWorkshopItemsPage).toHaveBeenCalledWith(payload, TEST_ACCOUNT.apiKey, {
      allowWebApi: true,
      webApiAccess: 'active'
    })
  })

  it('disables Web API access consistently when secure storage is unavailable', async () => {
    mocks.secretStore.isSecureStorageAvailable.mockReturnValueOnce(false)
    const payload = { page: 1, pageSize: 12 }
    const handler = mocks.handlers.get('workshop:getMyWorkshopItemsPage')!

    await handler(payload)

    expect(mocks.profileStore.setWebApiEnabled).toHaveBeenLastCalledWith(false)
    expect(mocks.runtime.getMyWorkshopItemsPage).toHaveBeenLastCalledWith(payload, undefined, {
      allowWebApi: false,
      webApiAccess: 'configured_unavailable'
    })
  })

  it('normalizes login persistence and delegates uploads', async () => {
    const login = mocks.handlers.get('workshop:login')!
    await expect(login({
      username: TEST_ACCOUNT.username, password: TEST_ACCOUNT.password, rememberUsername: false,
      rememberAuth: true, useStoredAuth: true, preferredAuthMode: 'steam_guard_mobile'
    })).resolves.toMatchObject({ sessionId: 'session-1', rememberedUsername: TEST_ACCOUNT.username })
    expect(mocks.runtime.login).toHaveBeenCalledWith(TEST_ACCOUNT.username, TEST_ACCOUNT.password, true, 'steam_guard_mobile')

    const upload = mocks.handlers.get('workshop:uploadMod')!
    const draft = createUploadDraft({ title: 'Test' })
    await upload({ draft })
    expect(mocks.runtime.upload).toHaveBeenCalledWith(draft, 'upload')
  })

  it('deletes cached authentication files when the saved session is cleared', async () => {
    const clearStoredSession = mocks.handlers.get('workshop:clearStoredSession')!

    await expect(clearStoredSession()).resolves.toEqual({ ok: true })

    expect(mocks.runtime.clearAuthCacheForStrictLogin).toHaveBeenCalledTimes(1)
    expect(mocks.profileStore.setRememberAuth).toHaveBeenCalledWith(false)
  })
})
