import { beforeEach, describe, expect, it, vi } from 'vitest'

const { contextBridgeMock, ipcRendererMock } = vi.hoisted(() => ({
  contextBridgeMock: { exposeInMainWorld: vi.fn() },
  ipcRendererMock: { invoke: vi.fn(), on: vi.fn(), off: vi.fn() }
}))

vi.mock('electron', () => ({ contextBridge: contextBridgeMock, ipcRenderer: ipcRendererMock }))

await import('../../../src/electron/preload')

describe('preload bridge', () => {
  const api = contextBridgeMock.exposeInMainWorld.mock.calls[0]?.[1] as Record<string, (...args: unknown[]) => unknown>

  beforeEach(() => vi.clearAllMocks())

  it.each([
    'ensureSteamCmdInstalled', 'getAppVersion', 'logout', 'clearStoredSession',
    'getProfiles', 'getAdvancedSettings', 'getInstallLog', 'getRunLogs',
    'getCurrentProfile', 'pickFolder', 'pickFile', 'pickSteamCmdExecutable', 'pickFiles'
  ])('forwards %s without a payload and returns its IPC result', async method => {
    const result = { response: method }
    ipcRendererMock.invoke.mockResolvedValueOnce(result)
    await expect(api[method]!()).resolves.toBe(result)
    expect(ipcRendererMock.invoke).toHaveBeenCalledExactlyOnceWith(`workshop:${method}`)
  })

  it.each([
    ['login', { username: 'alice', password: 'secret' }],
    ['savePreferredAuthMode', { preferredAuthMode: 'otp' }],
    ['submitSteamGuardCode', { sessionId: 'session', code: '12345' }],
    ['uploadMod', { draft: { appId: '480' } }],
    ['updateMod', { draft: { publishedFileId: '123' } }],
    ['updateVisibility', { appId: '480', publishedFileId: '123', visibility: 2 }],
    ['saveAdvancedSettings', { webApiEnabled: false }],
    ['saveProfile', { profile: { id: 'profile' } }],
    ['deleteProfile', { profileId: 'profile' }],
    ['getMyWorkshopItems', { appId: '480' }],
    ['listContentFolderFiles', { folderPath: '/content' }],
    ['openPath', { path: '/content' }],
    ['openExternal', { url: 'https://steamcommunity.com' }],
    ['getLocalImagePreview', { path: '/preview.png' }]
  ] as const)('forwards %s with its payload unchanged', async (method, payload) => {
    const result = { response: method }
    ipcRendererMock.invoke.mockResolvedValueOnce(result)
    await expect(api[method]!(payload)).resolves.toBe(result)
    expect(ipcRendererMock.invoke).toHaveBeenCalledExactlyOnceWith(`workshop:${method}`, payload)
  })

  it('wraps a run ID in the main-process request contract and propagates rejection', async () => {
    const error = new Error('IPC unavailable')
    ipcRendererMock.invoke.mockRejectedValueOnce(error)
    await expect(api.getRunLog!('run-1')).rejects.toBe(error)
    expect(ipcRendererMock.invoke).toHaveBeenCalledExactlyOnceWith('workshop:getRunLog', { runId: 'run-1' })
  })

  it('exposes the paged workshop request on the correct IPC channel', async () => {
    ipcRendererMock.invoke.mockResolvedValue({ items: [], page: 2, pageSize: 12, hasNext: false })
    const payload = { appId: '480', page: 2, pageSize: 12, visibility: 'public' }

    await expect(api.getMyWorkshopItemsPage(payload as never)).resolves.toMatchObject({ page: 2 })
    expect(ipcRendererMock.invoke).toHaveBeenCalledWith('workshop:getMyWorkshopItemsPage', payload)
  })

  it('maps commands and removes the exact run-event listener', async () => {
    ipcRendererMock.invoke.mockResolvedValue({ ok: true })
    await api.quitApp()
    expect(ipcRendererMock.invoke).toHaveBeenCalledWith('workshop:quitApp')

    const callback = vi.fn()
    const unsubscribe = api.onRunEvent(callback as never) as () => void
    const listener = ipcRendererMock.on.mock.calls[0]?.[1] as (event: unknown, payload: unknown) => void
    listener({}, { runId: 'r1', type: 'run_started' })
    expect(callback).toHaveBeenCalledWith({ runId: 'r1', type: 'run_started' })
    unsubscribe()
    expect(ipcRendererMock.off).toHaveBeenCalledWith('workshop:runEvent', listener)
  })
})
