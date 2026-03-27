import { EventEmitter } from 'node:events'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getMock, spawnMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  spawnMock: vi.fn()
}))

vi.mock('node:https', () => ({
  get: getMock
}))

vi.mock('node:child_process', () => ({
  spawn: spawnMock
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

describe('SteamCmdInstallManager PowerShell extraction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('escapes apostrophes in Windows install paths before invoking PowerShell', async () => {
    const baseRoot = await mkdtemp(join(tmpdir(), 'steamcmd-install-'))
    const root = join(baseRoot, "o'connor")
    await mkdir(root, { recursive: true })

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

    let invokedCommand = ''
    spawnMock.mockImplementation((command: string, args: string[]) => {
      const child = new EventEmitter()

      queueMicrotask(async () => {
        if (command === 'powershell') {
          invokedCommand = String(args[1] ?? '')
          await writeFile(join(root, 'steamcmd', 'steamcmd.exe'), 'steamcmd', 'utf8')
        }
        child.emit('close', 0)
      })

      return child
    })

    await withPlatform('win32', async () => {
      const manager = new SteamCmdInstallManager(root)
      const status = await manager.ensureInstalled()

      expect(status.installed).toBe(true)
      expect(status.source).toBe('auto')
      expect(invokedCommand).toContain('Expand-Archive -LiteralPath')
      expect(invokedCommand).toContain("o''connor")
    })
  })
})
