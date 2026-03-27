import { chmod, mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SteamCmdInstallManager } from '../../src/backend/services/steamcmd-install-manager'

async function withPlatform<T>(platform: NodeJS.Platform, run: () => Promise<T> | T): Promise<T> {
  const originalPlatform = process.platform
  Object.defineProperty(process, 'platform', { value: platform, configurable: true })
  try {
    return await run()
  } finally {
    Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true })
  }
}

describe('SteamCmdInstallManager', () => {
  it('uses manual executable path when provided and valid', async () => {
    const root = await mkdtemp(join(tmpdir(), 'steamcmd-install-'))
    const fakeExecutable = join(root, 'steamcmd.sh')
    await writeFile(fakeExecutable, '#!/bin/sh\necho steamcmd\n', 'utf8')
    await chmod(fakeExecutable, 0o755)

    const manager = new SteamCmdInstallManager(root)
    manager.setManualExecutablePath(fakeExecutable)

    const status = await manager.getStatus()
    expect(status.installed).toBe(true)
    expect(status.source).toBe('manual')
    expect(status.executablePath).toBe(fakeExecutable)
  })

  it('uses platform-specific default executable path', async () => {
    const root = await mkdtemp(join(tmpdir(), 'steamcmd-install-'))
    const manager = new SteamCmdInstallManager(root)

    await withPlatform('win32', () => {
      expect(manager.defaultExecutablePath).toBe(join(root, 'steamcmd', 'steamcmd.exe'))
    })

    await withPlatform('linux', () => {
      expect(manager.defaultExecutablePath).toBe(join(root, 'steamcmd', 'steamcmd.sh'))
    })
  })

  it('detects auto-installed executable for each supported platform name', async () => {
    const root = await mkdtemp(join(tmpdir(), 'steamcmd-install-'))
    const manager = new SteamCmdInstallManager(root)

    await withPlatform('win32', async () => {
      const exePath = join(root, 'steamcmd', 'steamcmd.exe')
      await mkdir(join(root, 'steamcmd'), { recursive: true })
      await writeFile(exePath, 'echo steamcmd\n', 'utf8')

      const status = await manager.getStatus()
      expect(status.installed).toBe(true)
      expect(status.source).toBe('auto')
      expect(status.executablePath).toBe(exePath)
    })

    await withPlatform('linux', async () => {
      const exePath = join(root, 'steamcmd', 'steamcmd.sh')
      await mkdir(join(root, 'steamcmd'), { recursive: true })
      await writeFile(exePath, '#!/bin/sh\necho steamcmd\n', 'utf8')
      await chmod(exePath, 0o755)

      const status = await manager.getStatus()
      expect(status.installed).toBe(true)
      expect(status.source).toBe('auto')
      expect(status.executablePath).toBe(exePath)
    })
  })

  it('treats non-executable manual paths as missing on linux', async () => {
    const root = await mkdtemp(join(tmpdir(), 'steamcmd-install-'))
    const fakeExecutable = join(root, 'steamcmd.sh')
    await writeFile(fakeExecutable, '#!/bin/sh\necho steamcmd\n', 'utf8')

    const manager = new SteamCmdInstallManager(root)
    manager.setManualExecutablePath(fakeExecutable)

    await withPlatform('linux', async () => {
      const status = await manager.getStatus()
      expect(status.installed).toBe(false)
      expect(status.source).toBe('missing')
      expect(status.executablePath).toBe(manager.defaultExecutablePath)
    })
  })

  it('rejects auto-install on unsupported platform', async () => {
    const root = await mkdtemp(join(tmpdir(), 'steamcmd-install-'))
    const manager = new SteamCmdInstallManager(root)

    await withPlatform('darwin', async () => {
      await expect(manager.ensureInstalled()).rejects.toThrow('SteamCMD auto-install is unavailable for this OS')
    })
  })
})
