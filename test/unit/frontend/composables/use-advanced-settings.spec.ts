/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAdvancedSettings } from '@frontend/composables/useAdvancedSettings'

describe('useAdvancedSettings composable', () => {
  const workshop = {
    ensureSteamCmdInstalled: vi.fn(async () => ({
      installed: true,
      executablePath: '/managed/steamcmd.sh',
      source: 'auto'
    })),
    getInstallLog: vi.fn(async () => ({
      path: '/tmp/steamcmd-install.log',
      content: '[install] log',
      exists: true
    })),
    pickSteamCmdExecutable: vi.fn(async () => '/tools/steamcmd.sh'),
    openPath: vi.fn(async () => ({ ok: true })),
    getAdvancedSettings: vi.fn(async () => ({
      webApiEnabled: false,
      hasWebApiKey: false,
      secureStorageAvailable: true,
      steamCmdManualPath: undefined,
      steamCmdInstalled: true,
      steamCmdSource: 'auto',
      timeouts: {
        loginTimeoutMs: 30_000,
        storedSessionTimeoutMs: 10_000,
        workshopTimeoutMs: 60_000
      }
    })),
    saveAdvancedSettings: vi.fn(async () => ({
      webApiEnabled: false,
      hasWebApiKey: false,
      secureStorageAvailable: true,
      steamCmdManualPath: undefined,
      steamCmdInstalled: true,
      steamCmdSource: 'auto',
      timeouts: {
        loginTimeoutMs: 30_000,
        storedSessionTimeoutMs: 10_000,
        workshopTimeoutMs: 60_000
      }
    }))
  }

  beforeEach(() => {
    vi.clearAllMocks()
    ;(window as unknown as { workshop: typeof workshop }).workshop = workshop
  })

  function createComposable() {
    const statusMessages: string[] = []
    const advanced = useAdvancedSettings({
      normalizeError: (error) => ({
        code: 'command_failed',
        message: error instanceof Error ? error.message : 'Unexpected error'
      }),
      setStatusMessage: (message) => {
        statusMessages.push(message)
      }
    })
    return { advanced, statusMessages }
  }

  it('loads install log path when SteamCMD install fails', async () => {
    workshop.ensureSteamCmdInstalled.mockRejectedValueOnce(
      new Error('[install] SteamCMD was downloaded but executable validation failed')
    )
    const { advanced } = createComposable()

    await advanced.ensureSteamCmdInstalled()

    expect(workshop.getInstallLog).toHaveBeenCalledTimes(1)
    expect(advanced.installLogPath.value).toBe('/tmp/steamcmd-install.log')
  })

  it('stores selected manual SteamCMD path in advanced state', async () => {
    const { advanced } = createComposable()

    await advanced.pickSteamCmdManualPath()

    expect(workshop.pickSteamCmdExecutable).toHaveBeenCalledTimes(1)
    expect(advanced.advancedSettings.steamCmdManualPath).toBe('/tools/steamcmd.sh')
  })
})
