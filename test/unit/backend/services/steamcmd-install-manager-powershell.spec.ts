import { EventEmitter } from 'node:events'
import { access, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { zipFixture } from '../../../helpers/zip-fixture'

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }))
vi.mock('node:https', () => ({ get: getMock }))
const { SteamCmdInstallManager } = await import('@backend/services/steamcmd/install-manager')

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })

function respondWith(archive: Buffer) {
  getMock.mockImplementation((_url: string, callback: (response: PassThrough) => void) => {
    const request = new EventEmitter()
    const response = Object.assign(new PassThrough(), { statusCode: 200, headers: {} })
    queueMicrotask(() => { callback(response); response.end(archive) })
    return request
  })
}

async function setup(archive: Buffer) {
  const root = await mkdtemp(join(tmpdir(), "steamcmd-o'connor-"))
  roots.push(root)
  respondWith(archive)
  return { root, manager: new SteamCmdInstallManager(root, 'windows') }
}

describe('SteamCmdInstallManager Windows ZIP extraction', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it.each(['steamcmd.exe', 'portable/steamcmd.exe'])('installs %s from a real ZIP and records the install log', async name => {
    const { root, manager } = await setup(zipFixture([{ name, content: 'steamcmd' }]))
    const status = await manager.ensureInstalled()
    expect(status).toEqual({ installed: true, source: 'auto', executablePath: join(root, 'steamcmd', name) })
    expect(await readFile(status.executablePath, 'utf8')).toBe('steamcmd')
    expect((await manager.getInstallLog()).content).toContain('SteamCMD install completed successfully')
    expect((await manager.getInstallLog()).content).toContain('Extracting ZIP archive in-process')
    expect((await readdir(root)).some(name => name.startsWith('.steamcmd-extract-'))).toBe(false)
    await expect(access(join(root, 'steamcmd', 'steamcmd.zip'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rejects an invalid archive signature and removes the downloaded file', async () => {
    const { root, manager } = await setup(Buffer.from('not-a-zip'))
    await expect(manager.ensureInstalled()).rejects.toMatchObject({ code: 'install', message: expect.stringContaining('not a valid installer archive') })
    await expect(access(join(root, 'steamcmd', 'steamcmd.zip'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rejects symlink plus duplicate-file attacks and discards a partially extracted executable', async () => {
    const { root, manager } = await setup(zipFixture([
      { name: 'steamcmd.exe', content: 'partial' },
      { name: 'escape', content: '../victim', mode: 0o120777 },
      { name: 'escape', content: 'overwritten' }
    ]))
    await writeFile(join(root, 'victim'), 'untouched')
    await expect(manager.ensureInstalled()).rejects.toMatchObject({ code: 'install' })
    expect(await readFile(join(root, 'victim'), 'utf8')).toBe('untouched')
    expect((await manager.getStatus()).installed).toBe(false)
    expect(await readdir(join(root, 'steamcmd'))).toEqual([])
    expect((await readdir(root)).some(name => name.startsWith('.steamcmd-extract-'))).toBe(false)
    respondWith(zipFixture([{ name: 'steamcmd.exe', content: 'valid' }]))
    expect((await manager.ensureInstalled()).installed).toBe(true)
  })

  it('does not publish a ZIP without the expected executable', async () => {
    const { root, manager } = await setup(zipFixture([{ name: 'other', content: 'other' }]))
    await expect(manager.ensureInstalled()).rejects.toMatchObject({ code: 'install', message: expect.stringContaining('executable validation failed') })
    expect(await readdir(join(root, 'steamcmd'))).toEqual([])
  })

  it('preserves existing files rather than merging an incomplete installation', async () => {
    const { root, manager } = await setup(zipFixture([{ name: 'steamcmd.exe', content: 'steamcmd' }]))
    await mkdir(join(root, 'steamcmd'))
    await writeFile(join(root, 'steamcmd', 'steamcmd.zip'), 'existing user file')
    await expect(manager.ensureInstalled()).rejects.toMatchObject({ code: 'install', message: expect.stringContaining('Move it aside') })
    expect(await readFile(join(root, 'steamcmd', 'steamcmd.zip'), 'utf8')).toBe('existing user file')
    expect(getMock).not.toHaveBeenCalled()
  })

  it('rejects an existing installation-directory link', async () => {
    const { root, manager } = await setup(zipFixture([{ name: 'steamcmd.exe', content: 'steamcmd' }]))
    await mkdir(join(root, 'target'))
    await symlink(join(root, 'target'), join(root, 'steamcmd'), 'junction')
    await expect(manager.ensureInstalled()).rejects.toMatchObject({ code: 'install' })
    expect(await readdir(join(root, 'target'))).toEqual([])
    expect(getMock).not.toHaveBeenCalled()
  })

  it('shares one installation attempt between concurrent callers', async () => {
    const { manager } = await setup(zipFixture([{ name: 'steamcmd.exe', content: 'steamcmd' }]))
    const [first, second] = await Promise.all([manager.ensureInstalled(), manager.ensureInstalled()])
    expect(first).toEqual(second)
    expect(getMock).toHaveBeenCalledTimes(1)
  })
})
