import { beforeEach, describe, expect, it, vi } from 'vitest'

const { contextBridgeMock, ipcRendererMock } = vi.hoisted(() => ({
  contextBridgeMock: { exposeInMainWorld: vi.fn() },
  ipcRendererMock: { invoke: vi.fn(), on: vi.fn(), off: vi.fn() }
}))

vi.mock('electron', () => ({ contextBridge: contextBridgeMock, ipcRenderer: ipcRendererMock }))

await import('../../../src/electron/preload')

describe('preload bridge', () => {
  const api = contextBridgeMock.exposeInMainWorld.mock.calls[0]?.[1] as Record<string, (...args: never[]) => unknown>

  beforeEach(() => vi.clearAllMocks())

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
