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

    getMock.mockImplementation((_url: string, callback: (response: PassThrough & { statusCode?: number }) => void) => {
      const request = new EventEmitter()
      const response = new PassThrough() as PassThrough & { statusCode?: number }
      response.statusCode = 200

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
})
