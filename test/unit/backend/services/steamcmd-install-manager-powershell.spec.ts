import { EventEmitter } from 'node:events'
import { access, mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { extractZipMock, getMock } = vi.hoisted(() => ({
  extractZipMock: vi.fn(),
  getMock: vi.fn(),
}))

vi.mock('node:https', () => ({
  get: getMock
}))

vi.mock('extract-zip', () => ({
  default: extractZipMock
}))

const { SteamCmdInstallManager } = await import('@backend/services/steamcmd/install-manager')

describe('SteamCmdInstallManager Windows ZIP extraction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('extracts ZIP archive in-process and records install log details on windows', async () => {
    const baseRoot = await mkdtemp(join(tmpdir(), 'steamcmd-install-'))
    const root = join(baseRoot, "o'connor")
    await mkdir(root, { recursive: true })

    getMock.mockImplementation((_url: string, callback: (response: PassThrough & { statusCode?: number }) => void) => {
      const request = new EventEmitter()
      const response = new PassThrough() as PassThrough & { statusCode?: number }
      response.statusCode = 200

      queueMicrotask(() => {
        callback(response)
        response.end(Buffer.from([0x50, 0x4b, 0x03, 0x04]))
      })

      return request
    })

    extractZipMock.mockImplementation(async (_archivePath: string, options: { dir: string }) => {
      await writeFile(join(options.dir, 'steamcmd.exe'), 'steamcmd', 'utf8')
    })

    const manager = new SteamCmdInstallManager(root, 'windows')
    const status = await manager.ensureInstalled()
    const installLog = await manager.getInstallLog()

    expect(status.installed).toBe(true)
    expect(status.source).toBe('auto')
    expect(extractZipMock).toHaveBeenCalledTimes(1)
    expect(installLog.exists).toBe(true)
    expect(installLog.content).toContain('SteamCMD install attempt started')
    expect(installLog.content).toContain('profile=windows')
    expect(installLog.content).toContain('Extracting ZIP archive in-process')
    expect(installLog.content).toContain('SteamCMD install completed successfully')
  })

  it('accepts nested steamcmd.exe after Windows extraction completes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'steamcmd-install-'))

    getMock.mockImplementation((_url: string, callback: (response: PassThrough & { statusCode?: number }) => void) => {
      const request = new EventEmitter()
      const response = new PassThrough() as PassThrough & { statusCode?: number }
      response.statusCode = 200

      queueMicrotask(() => {
        callback(response)
        response.end(Buffer.from([0x50, 0x4b, 0x03, 0x04]))
      })

      return request
    })

    extractZipMock.mockImplementation(async (_archivePath: string, options: { dir: string }) => {
      await mkdir(join(options.dir, 'portable'), { recursive: true })
      await writeFile(join(options.dir, 'portable', 'steamcmd.exe'), 'steamcmd', 'utf8')
    })

    const manager = new SteamCmdInstallManager(root, 'windows')
    const status = await manager.ensureInstalled()

    expect(status.installed).toBe(true)
    expect(status.source).toBe('auto')
    expect(status.executablePath).toBe(join(root, 'steamcmd', 'portable', 'steamcmd.exe'))
  })

  it('rejects an invalid archive signature and removes the downloaded file', async () => {
    const root = await mkdtemp(join(tmpdir(), 'steamcmd-install-'))
    getMock.mockImplementation((_url: string, callback: (response: PassThrough & { statusCode?: number }) => void) => {
      const request = new EventEmitter()
      const response = new PassThrough() as PassThrough & { statusCode?: number }
      response.statusCode = 200
      queueMicrotask(() => {
        callback(response)
        response.end('not-a-zip')
      })
      return request
    })

    await expect(new SteamCmdInstallManager(root, 'windows').ensureInstalled()).rejects.toMatchObject({
      code: 'install',
      message: expect.stringContaining('not a valid installer archive')
    })
    expect(extractZipMock).not.toHaveBeenCalled()
    await expect(access(join(root, 'steamcmd', 'steamcmd.zip'))).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
