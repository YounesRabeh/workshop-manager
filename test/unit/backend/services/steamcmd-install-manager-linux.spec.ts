import { EventEmitter } from 'node:events'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { getMock, spawnMock } = vi.hoisted(() => ({ getMock: vi.fn(), spawnMock: vi.fn() }))
vi.mock('node:https', () => ({ get: getMock }))
vi.mock('node:child_process', () => ({ spawn: spawnMock }))
import { SteamCmdInstallManager } from '@backend/services/steamcmd/install-manager'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); vi.clearAllMocks() })

describe('SteamCMD Linux archive extraction', () => {
  it.each(['success', 'nonzero', 'spawn-error'] as const)('handles tar outcome: %s', async outcome => {
    const root = await mkdtemp(join(tmpdir(), 'steamcmd-linux-'))
    roots.push(root)
    getMock.mockImplementation((_url: string, callback: (response: PassThrough) => void) => {
      const response = Object.assign(new PassThrough(), { statusCode: 200, headers: {} })
      queueMicrotask(() => { callback(response); response.end(Buffer.from([0x1f, 0x8b, 0, 0])) })
      return new EventEmitter()
    })
    spawnMock.mockImplementation(() => {
      const child = new EventEmitter()
      queueMicrotask(() => {
        if (outcome === 'spawn-error') child.emit('error', new Error('tar unavailable'))
        else if (outcome === 'nonzero') child.emit('close', 1)
        else void (async () => {
          await writeFile(join(root, 'steamcmd', 'steamcmd.sh'), '#!/bin/sh\n', { mode: 0o755 })
          await writeFile(join(root, 'steamcmd', 'readme.txt'), 'SteamCMD')
          child.emit('close', 0)
        })().catch(error => child.emit('error', error))
      })
      return child
    })
    const manager = new SteamCmdInstallManager(root, 'linux')
    if (outcome === 'success') {
      await expect(manager.ensureInstalled()).resolves.toMatchObject({ installed: true, source: 'auto' })
      expect(await readFile(join(root, 'steamcmd', 'steamcmd.sh'), 'utf8')).toBe('#!/bin/sh\n')
    } else {
      await expect(manager.ensureInstalled()).rejects.toMatchObject({ code: 'install', message: expect.stringContaining('Extraction command failed') })
      expect((await manager.getStatus()).installed).toBe(false)
    }
    expect(spawnMock).toHaveBeenCalledExactlyOnceWith('tar', ['-xzf', join(root, 'steamcmd', 'steamcmd.tar.gz'), '-C', join(root, 'steamcmd')], { cwd: join(root, 'steamcmd'), stdio: 'ignore' })
  })
})
