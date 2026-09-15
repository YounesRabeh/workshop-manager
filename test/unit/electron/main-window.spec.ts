import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { electronState, appMock, shellMock, BrowserWindowMock, existsSyncMock } = vi.hoisted(() => {
  const electronState = {
    isPackaged: false,
    window: undefined as undefined | {
      webContents: {
        setWindowOpenHandler: ReturnType<typeof vi.fn>
        on: ReturnType<typeof vi.fn>
      }
      loadURL: ReturnType<typeof vi.fn>
      loadFile: ReturnType<typeof vi.fn>
      setIcon: ReturnType<typeof vi.fn>
    }
  }
  const appMock = {
    get isPackaged() { return electronState.isPackaged },
    getAppPath: vi.fn(() => '/app'),
    dock: undefined
  }
  const shellMock = { openExternal: vi.fn(async () => undefined) }
  const BrowserWindowMock = vi.fn(function () {
    const window = {
      webContents: { setWindowOpenHandler: vi.fn(), on: vi.fn() },
      loadURL: vi.fn(async () => undefined),
      loadFile: vi.fn(async () => undefined),
      setIcon: vi.fn()
    }
    electronState.window = window
    return window
  })
  return { electronState, appMock, shellMock, BrowserWindowMock, existsSyncMock: vi.fn(() => false) }
})

vi.mock('electron', () => ({
  app: appMock,
  BrowserWindow: BrowserWindowMock,
  nativeImage: { createFromPath: vi.fn() },
  shell: shellMock
}))
vi.mock('node:fs', () => ({ existsSync: existsSyncMock }))

import { createMainWindow } from '../../../src/electron/main-window'

describe('main window security', () => {
  const originalRendererUrl = process.env['ELECTRON_RENDERER_URL']

  beforeEach(() => {
    vi.clearAllMocks()
    electronState.isPackaged = false
    electronState.window = undefined
    delete process.env['ELECTRON_RENDERER_URL']
  })

  afterEach(() => {
    if (originalRendererUrl === undefined) delete process.env['ELECTRON_RENDERER_URL']
    else process.env['ELECTRON_RENDERER_URL'] = originalRendererUrl
  })

  it('loads only a localhost dev server with hardened web preferences', async () => {
    process.env['ELECTRON_RENDERER_URL'] = 'http://127.0.0.1:5173/'
    await createMainWindow()

    expect(BrowserWindowMock).toHaveBeenCalledWith(expect.objectContaining({
      webPreferences: expect.objectContaining({ nodeIntegration: false, contextIsolation: true, sandbox: true })
    }))
    expect(electronState.window?.loadURL).toHaveBeenCalledWith('http://127.0.0.1:5173/')
    expect(electronState.window?.loadFile).not.toHaveBeenCalled()
  })

  it('rejects remote development renderer URLs', async () => {
    process.env['ELECTRON_RENDERER_URL'] = 'https://evil.example/app'
    await expect(createMainWindow()).rejects.toThrow('must use HTTP(S) on localhost')
  })

  it('ignores development URLs in packaged builds and blocks unsafe navigation', async () => {
    electronState.isPackaged = true
    process.env['ELECTRON_RENDERER_URL'] = 'http://127.0.0.1:5173/'
    await createMainWindow()
    expect(electronState.window?.loadURL).not.toHaveBeenCalled()
    expect(electronState.window?.loadFile).toHaveBeenCalledOnce()

    const navigateCall = electronState.window?.webContents.on.mock.calls.find(([event]) => event === 'will-navigate')
    const navigate = navigateCall?.[1] as (event: { preventDefault: () => void }, url: string) => void
    const event = { preventDefault: vi.fn() }
    navigate(event, 'file:///etc/passwd')
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(shellMock.openExternal).not.toHaveBeenCalled()
  })

  it('opens safe popup URLs externally while denying the popup', async () => {
    await createMainWindow()
    const handler = electronState.window?.webContents.setWindowOpenHandler.mock.calls[0]?.[0] as (details: { url: string }) => unknown
    expect(handler({ url: 'https://steamcommunity.com/' })).toEqual({ action: 'deny' })
    expect(shellMock.openExternal).toHaveBeenCalledWith('https://steamcommunity.com/')
  })
})
