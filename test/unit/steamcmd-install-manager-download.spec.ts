import { EventEmitter } from 'node:events'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createWriteStreamMock, getMock } = vi.hoisted(() => ({
  createWriteStreamMock: vi.fn(),
  getMock: vi.fn()
}))

vi.mock('node:fs', () => ({
  createWriteStream: createWriteStreamMock
}))

vi.mock('node:https', () => ({
  get: getMock
}))

const { SteamCmdInstallManager } = await import('../../src/backend/services/steamcmd-install-manager')

describe('SteamCmdInstallManager download failures', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('converts write-stream failures into install errors', async () => {
    const root = await mkdtemp(join(tmpdir(), 'steamcmd-install-'))

    createWriteStreamMock.mockImplementation(() => {
      const stream = new PassThrough()
      queueMicrotask(() => {
        stream.emit('error', new Error('disk full'))
      })
      return stream
    })

    getMock.mockImplementation((_url: string, callback: (response: PassThrough & { statusCode?: number; headers?: Record<string, string> }) => void) => {
      const request = new EventEmitter()
      const response = new PassThrough() as PassThrough & { statusCode?: number; headers?: Record<string, string> }
      response.statusCode = 200
      response.headers = {}

      queueMicrotask(() => {
        callback(response)
        response.end('archive-bytes')
      })

      return request
    })

    const manager = new SteamCmdInstallManager(root, 'linux')

    await expect(manager.ensureInstalled()).rejects.toMatchObject({
      code: 'install',
      message: 'SteamCMD download failed: disk full'
    })
  })

  it('follows HTTP redirects before writing the archive to disk', async () => {
    const root = await mkdtemp(join(tmpdir(), 'steamcmd-install-'))

    createWriteStreamMock.mockImplementation(() => {
      const stream = new PassThrough() as PassThrough & {
        close: (callback: (error?: Error | null) => void) => void
      }
      stream.close = (callback) => callback(null)
      return stream
    })

    getMock.mockImplementation((url: string, callback: (response: PassThrough & { statusCode?: number; headers?: Record<string, string> }) => void) => {
      const request = new EventEmitter()
      const response = new PassThrough() as PassThrough & { statusCode?: number; headers?: Record<string, string> }

      if (url === 'https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz') {
        response.statusCode = 302
        response.headers = {
          location: 'https://cdn.example.com/steamcmd.tar.gz'
        }
      } else {
        response.statusCode = 200
        response.headers = {}
      }

      queueMicrotask(() => {
        callback(response)
        response.end('archive-bytes')
      })

      return request
    })

    const manager = new SteamCmdInstallManager(root, 'linux')

    await expect(manager.ensureInstalled()).rejects.toMatchObject({
      code: 'install',
      message: expect.stringContaining('Extraction command failed')
    })

    expect(getMock).toHaveBeenNthCalledWith(
      1,
      'https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz',
      expect.any(Function)
    )
    expect(getMock).toHaveBeenNthCalledWith(
      2,
      'https://cdn.example.com/steamcmd.tar.gz',
      expect.any(Function)
    )
  })
})
