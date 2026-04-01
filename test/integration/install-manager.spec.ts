import { chmod, mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SteamCmdInstallManager } from '../../src/backend/services/steamcmd-install-manager'

describe('SteamCmdInstallManager', () => {
  it('uses manual executable path when provided and valid', async () => {
    const root = await mkdtemp(join(tmpdir(), 'steamcmd-install-'))
    const fakeExecutable = join(root, 'steamcmd.sh')
    await writeFile(fakeExecutable, '#!/bin/sh\necho steamcmd\n', 'utf8')
    await chmod(fakeExecutable, 0o755)

    const manager = new SteamCmdInstallManager(root, 'linux')
    manager.setManualExecutablePath(fakeExecutable)

    const status = await manager.getStatus()
    expect(status.installed).toBe(true)
    expect(status.source).toBe('manual')
    expect(status.executablePath).toBe(fakeExecutable)
  })

  it('uses platform-specific default executable path', async () => {
    const root = await mkdtemp(join(tmpdir(), 'steamcmd-install-'))
    const windowsManager = new SteamCmdInstallManager(root, 'windows')
    const linuxManager = new SteamCmdInstallManager(root, 'linux')

    expect(windowsManager.defaultExecutablePath).toBe(join(root, 'steamcmd', 'steamcmd.exe'))
    expect(linuxManager.defaultExecutablePath).toBe(join(root, 'steamcmd', 'steamcmd.sh'))
  })

  it('detects auto-installed executable for each supported platform name', async () => {
    const root = await mkdtemp(join(tmpdir(), 'steamcmd-install-'))
    const windowsExePath = join(root, 'steamcmd', 'steamcmd.exe')
    await mkdir(join(root, 'steamcmd'), { recursive: true })
    await writeFile(windowsExePath, 'echo steamcmd\n', 'utf8')

    const windowsStatus = await new SteamCmdInstallManager(root, 'windows').getStatus()
    expect(windowsStatus.installed).toBe(true)
    expect(windowsStatus.source).toBe('auto')
    expect(windowsStatus.executablePath).toBe(windowsExePath)

    const linuxRoot = await mkdtemp(join(tmpdir(), 'steamcmd-install-'))
    const linuxExePath = join(linuxRoot, 'steamcmd', 'steamcmd.sh')
    await mkdir(join(linuxRoot, 'steamcmd'), { recursive: true })
    await writeFile(linuxExePath, '#!/bin/sh\necho steamcmd\n', 'utf8')
    await chmod(linuxExePath, 0o755)

    const linuxStatus = await new SteamCmdInstallManager(linuxRoot, 'linux').getStatus()
    expect(linuxStatus.installed).toBe(true)
    expect(linuxStatus.source).toBe('auto')
    expect(linuxStatus.executablePath).toBe(linuxExePath)
  })

  it('finds nested auto-installed SteamCMD executable on windows', async () => {
    const root = await mkdtemp(join(tmpdir(), 'steamcmd-install-'))
    const manager = new SteamCmdInstallManager(root, 'windows')
    const nestedDir = join(root, 'steamcmd', 'nested')
    const exePath = join(nestedDir, 'steamcmd.exe')
    await mkdir(nestedDir, { recursive: true })
    await writeFile(exePath, 'echo steamcmd\n', 'utf8')

    const status = await manager.getStatus()
    expect(status.installed).toBe(true)
    expect(status.source).toBe('auto')
    expect(status.executablePath).toBe(exePath)
  })

  it('treats non-executable manual paths as missing on linux', async () => {
    const root = await mkdtemp(join(tmpdir(), 'steamcmd-install-'))
    const fakeExecutable = join(root, 'steamcmd.sh')
    await writeFile(fakeExecutable, '#!/bin/sh\necho steamcmd\n', 'utf8')

    const manager = new SteamCmdInstallManager(root, 'linux')
    manager.setManualExecutablePath(fakeExecutable)

    const status = await manager.getStatus()
    expect(status.installed).toBe(false)
    expect(status.source).toBe('missing')
    expect(status.executablePath).toBe(manager.defaultExecutablePath)
  })
})
