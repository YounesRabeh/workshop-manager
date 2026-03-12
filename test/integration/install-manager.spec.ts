import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SteamCmdInstallManager } from '../../src/backend/services/steamcmd-install-manager'

describe('SteamCmdInstallManager manual fallback', () => {
  it('uses manual executable path when provided and valid', async () => {
    const root = await mkdtemp(join(tmpdir(), 'steamcmd-install-'))
    const fakeExecutable = join(root, 'steamcmd.sh')
    await writeFile(fakeExecutable, '#!/bin/sh\necho steamcmd\n', 'utf8')

    const manager = new SteamCmdInstallManager(root)
    manager.setManualExecutablePath(fakeExecutable)

    const status = await manager.getStatus()
    expect(status.installed).toBe(true)
    expect(status.source).toBe('manual')
    expect(status.executablePath).toBe(fakeExecutable)
  })
})
