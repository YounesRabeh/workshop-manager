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

async function withPlatform<T>(platform: NodeJS.Platform, run: () => Promise<T> | T): Promise<T> {
  const originalPlatform = process.platform
  Object.defineProperty(process, 'platform', { value: platform, configurable: true })
  try {
    return await run()
  } finally {
    Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true })
  }
}

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

    await withPlatform('linux', async () => {
      const manager = new SteamCmdInstallManager(root)

      await expect(manager.ensureInstalled()).rejects.toMatchObject({
        code: 'install',
        message: 'SteamCMD download failed: disk full'
      })
    })
  })
})
