import { beforeAll, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  const profileStore = {
    getProfiles: vi.fn(async () => []),
    getSteamCmdManualPath: vi.fn(async () => undefined),
    getTimeoutSettings: vi.fn(async () => ({ loginTimeoutMs: 60_000, storedSessionTimeoutMs: 10_000, workshopTimeoutMs: 60_000 })),
    getRememberAuth: vi.fn(async () => true),
    getRememberedUsername: vi.fn(async () => 'alice'),
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
  return { handlers, profileStore, runtime, installManager }
})

vi.mock('electron', () => ({
  app: {
    commandLine: { appendSwitch: vi.fn() },
    disableHardwareAcceleration: vi.fn(),
    whenReady: vi.fn(() => Promise.resolve()),
    on: vi.fn(),
    setName: vi.fn(),
    setDesktopName: vi.fn(),
    getVersion: vi.fn(() => '1.6.7'),
    quit: vi.fn(),
    exit: vi.fn()
  },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
  dialog: { showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] })), showErrorBox: vi.fn() },
  Menu: { setApplicationMenu: vi.fn() },
  shell: { openPath: vi.fn(async () => ''), openExternal: vi.fn(async () => undefined) }
}))
vi.mock('node:fs/promises', () => ({ mkdir: vi.fn(async () => undefined) }))
vi.mock('@backend/stores/profile-store', () => ({ ProfileStore: vi.fn(() => mocks.profileStore) }))
vi.mock('@backend/stores/run-log-store', () => ({
  RunLogStore: vi.fn(() => ({ list: vi.fn(async () => []), get: vi.fn(async () => null) }))
}))
vi.mock('@backend/services/steamcmd/install-manager', () => ({ SteamCmdInstallManager: vi.fn(() => mocks.installManager) }))
vi.mock('@backend/services/steamcmd/runtime-service', () => ({ SteamCmdRuntimeService: vi.fn(() => mocks.runtime) }))
vi.mock('@backend/services/steamcmd/platform-profile', () => ({ resolveSteamCmdPlatformProfile: vi.fn(() => 'linux') }))
vi.mock('@backend/services/app/path-provider', () => ({
  getAppPaths: vi.fn(() => ({ dataDir: '/data', profilesPath: '/data/profiles.json', runLogsDir: '/data/logs', runtimeDir: '/data/runtime' }))
}))
vi.mock('@backend/services/workshop/content-folder-scanner', () => ({ listContentFolderFiles: vi.fn(async () => []) }))
vi.mock('../../../src/electron/main-window', () => ({
  createMainWindow: vi.fn(async () => ({ webContents: { send: vi.fn() } }))
}))
vi.mock('../../../src/electron/secret-store', () => ({
  decryptSecret: vi.fn(() => 'decrypted-api-key'),
  encryptSecret: vi.fn(() => 'encrypted-new-key'),
  isSecureStorageAvailable: vi.fn(() => true)
}))
vi.mock('../../../src/electron/ipc-helpers', () => ({
  handleIpc: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => mocks.handlers.set(channel, handler))
}))
vi.mock('../../../src/electron/ipc-security', () => ({
  isSafeExternalUrl: vi.fn((url: string) => /^https?:/.test(url)),
  LocalImagePreviewAccess: vi.fn(() => ({ approve: vi.fn(async () => true), load: vi.fn(async () => undefined) }))
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

  it('passes paged workshop requests through with the main-process secret', async () => {
    const payload = { appId: '480', page: 2, pageSize: 12, visibility: 'public' }
    const handler = mocks.handlers.get('workshop:getMyWorkshopItemsPage')!

    await handler(payload)

    expect(mocks.runtime.getMyWorkshopItemsPage).toHaveBeenCalledWith(payload, 'decrypted-api-key', {
      allowWebApi: true,
      webApiAccess: 'active'
    })
  })

  it('normalizes login persistence and delegates uploads', async () => {
    const login = mocks.handlers.get('workshop:login')!
    await expect(login({
      username: 'alice', password: 'secret', rememberUsername: false,
      rememberAuth: true, useStoredAuth: true, preferredAuthMode: 'steam_guard_mobile'
    })).resolves.toMatchObject({ sessionId: 'session-1', rememberedUsername: 'alice' })
    expect(mocks.runtime.login).toHaveBeenCalledWith('alice', 'secret', true, 'steam_guard_mobile')

    const upload = mocks.handlers.get('workshop:uploadMod')!
    const draft = { appId: '480', contentFolder: '/mods', title: 'Test' }
    await upload({ draft })
    expect(mocks.runtime.upload).toHaveBeenCalledWith(draft, 'upload')
  })
})
