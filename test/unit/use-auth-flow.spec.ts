/** @vitest-environment jsdom */

import { describe, expect, it, vi, beforeEach } from 'vitest'
import { useAuthFlow } from '../../src/frontend/composables/useAuthFlow'

describe('useAuthFlow composable', () => {
  const workshop = {
    login: vi.fn(async () => ({ ok: true })),
    logout: vi.fn(async () => ({ ok: true })),
    clearStoredSession: vi.fn(async () => ({ ok: true })),
    submitSteamGuardCode: vi.fn(async () => ({ ok: true })),
    ensureSteamCmdInstalled: vi.fn(async () => ({
      installed: true,
      executablePath: '/managed/steamcmd.sh',
      source: 'auto'
    })),
    getInstallLog: vi.fn(async () => ({
      path: '/tmp/steamcmd-install.log',
      content: '[log] example',
      exists: true
    })),
    getProfiles: vi.fn(async () => ({
      profiles: [],
      rememberedUsername: 'alice',
      rememberAuth: false,
      hasStoredAuth: false
    })),
    getAdvancedSettings: vi.fn(async () => ({
      webApiEnabled: false,
      hasWebApiKey: false,
      secureStorageAvailable: true,
      steamCmdManualPath: undefined,
      steamCmdInstalled: true,
      steamCmdSource: 'auto'
    })),
    saveAdvancedSettings: vi.fn(async () => ({
      webApiEnabled: false,
      hasWebApiKey: false,
      secureStorageAvailable: true,
      steamCmdManualPath: undefined,
      steamCmdInstalled: true,
      steamCmdSource: 'auto'
    })),
    getCurrentProfile: vi.fn(async () => ({
      steamId64: '7656119',
      personaName: 'Alice',
      avatarUrl: ''
    })),
    getAppVersion: vi.fn(async () => ({ version: '0.1.0' })),
    openPath: vi.fn(async () => ({ ok: true })),
    quitApp: vi.fn(async () => ({ ok: true })),
    pickSteamCmdExecutable: vi.fn(async () => '/tools/steamcmd.sh')
  }

  beforeEach(() => {
    vi.clearAllMocks()
    ;(window as unknown as { workshop: typeof workshop }).workshop = workshop
  })

  it('calls timeout-log callback when login times out', async () => {
    workshop.login.mockRejectedValueOnce(new Error('[timeout] SteamCMD run exceeded timeout (10000ms)'))

    const onShowTimeoutLogs = vi.fn(async () => undefined)
    const flow = useAuthFlow({
      onShowTimeoutLogs,
      onHideTimeoutLogs: vi.fn(),
      onSignedIn: vi.fn(async () => undefined),
      onSignedOut: vi.fn()
    })

    flow.loginForm.username = 'alice'
    flow.loginForm.password = 'secret'
    await flow.login()

    expect(onShowTimeoutLogs).toHaveBeenCalledTimes(1)
    expect(flow.authIssue.value?.title).toBeTruthy()
  })

  it('hides timeout logs and calls signed-in callback on successful login', async () => {
    const onHideTimeoutLogs = vi.fn()
    const onSignedIn = vi.fn(async () => undefined)
    const flow = useAuthFlow({
      onShowTimeoutLogs: vi.fn(async () => undefined),
      onHideTimeoutLogs,
      onSignedIn,
      onSignedOut: vi.fn()
    })

    flow.loginForm.username = 'alice'
    flow.loginForm.password = 'secret'
    await flow.login()

    expect(flow.loginState.value).toBe('signed_in')
    expect(onHideTimeoutLogs).toHaveBeenCalledTimes(1)
    expect(onSignedIn).toHaveBeenCalledTimes(1)
  })

  it('applies steam guard prompt state from run events', () => {
    const flow = useAuthFlow({
      onShowTimeoutLogs: vi.fn(async () => undefined),
      onHideTimeoutLogs: vi.fn(),
      onSignedIn: vi.fn(async () => undefined),
      onSignedOut: vi.fn()
    })

    flow.handleRunEvent({
      runId: 'r1',
      ts: Date.now(),
      type: 'steam_guard_required',
      phase: 'login',
      promptType: 'steam_guard_code'
    })

    expect(flow.steamGuardPromptType.value).toBe('steam_guard_code')
    expect(flow.statusMessage.value).toContain('Steam Guard code required')
  })

  it('clears stored session flags and password', async () => {
    const flow = useAuthFlow({
      onShowTimeoutLogs: vi.fn(async () => undefined),
      onHideTimeoutLogs: vi.fn(),
      onSignedIn: vi.fn(async () => undefined),
      onSignedOut: vi.fn()
    })

    flow.loginForm.password = 'secret'
    flow.loginForm.rememberAuth = true
    flow.hasPersistedStoredSession.value = true

    await flow.clearStoredSession()

    expect(workshop.clearStoredSession).toHaveBeenCalledTimes(1)
    expect(flow.loginForm.password).toBe('')
    expect(flow.loginForm.rememberAuth).toBe(false)
    expect(flow.hasPersistedStoredSession.value).toBe(false)
  })

  it('signs out and triggers callbacks', async () => {
    const onHideTimeoutLogs = vi.fn()
    const onSignedOut = vi.fn()
    const flow = useAuthFlow({
      onShowTimeoutLogs: vi.fn(async () => undefined),
      onHideTimeoutLogs,
      onSignedIn: vi.fn(async () => undefined),
      onSignedOut
    })

    flow.loginState.value = 'signed_in'
    await flow.signOut()

    expect(flow.loginState.value).toBe('signed_out')
    expect(onHideTimeoutLogs).toHaveBeenCalledTimes(1)
    expect(onSignedOut).toHaveBeenCalledTimes(1)
  })

  it('picks a manual SteamCMD path into advanced settings', async () => {
    const flow = useAuthFlow({
      onShowTimeoutLogs: vi.fn(async () => undefined),
      onHideTimeoutLogs: vi.fn(),
      onSignedIn: vi.fn(async () => undefined),
      onSignedOut: vi.fn()
    })

    await flow.pickSteamCmdManualPath()

    expect(workshop.pickSteamCmdExecutable).toHaveBeenCalledTimes(1)
    expect(flow.advancedSettings.steamCmdManualPath).toBe('/tools/steamcmd.sh')
  })

  it('loads install log path when SteamCMD install fails', async () => {
    workshop.ensureSteamCmdInstalled.mockRejectedValueOnce(new Error('[install] SteamCMD was downloaded but executable validation failed'))

    const flow = useAuthFlow({
      onShowTimeoutLogs: vi.fn(async () => undefined),
      onHideTimeoutLogs: vi.fn(),
      onSignedIn: vi.fn(async () => undefined),
      onSignedOut: vi.fn()
    })

    await flow.ensureSteamCmdInstalled()

    expect(workshop.getInstallLog).toHaveBeenCalledTimes(1)
    expect(flow.installLogPath.value).toBe('/tmp/steamcmd-install.log')
  })
})
