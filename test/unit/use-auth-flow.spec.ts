/** @vitest-environment jsdom */

import { describe, expect, it, vi, beforeEach } from 'vitest'
import { useAuthFlow } from '../../src/frontend/composables/useAuthFlow'

describe('useAuthFlow composable', () => {
  const workshop = {
    login: vi.fn(async () => ({ ok: true })),
    logout: vi.fn(async () => ({ ok: true })),
    clearStoredSession: vi.fn(async () => ({ ok: true })),
    submitSteamGuardCode: vi.fn(async () => ({ ok: true })),
    ensureSteamCmdInstalled: vi.fn(async () => ({ installed: true })),
    getProfiles: vi.fn(async () => ({
      profiles: [],
      rememberedUsername: 'alice',
      rememberAuth: false,
      hasStoredAuth: false
    })),
    getAdvancedSettings: vi.fn(async () => ({
      webApiEnabled: false,
      hasWebApiKey: false,
      secureStorageAvailable: true
    })),
    saveAdvancedSettings: vi.fn(async () => ({
      webApiEnabled: false,
      hasWebApiKey: false,
      secureStorageAvailable: true
    })),
    getCurrentProfile: vi.fn(async () => ({
      steamId64: '7656119',
      personaName: 'Alice',
      avatarUrl: ''
    })),
    getAppVersion: vi.fn(async () => ({ version: '0.1.0' })),
    quitApp: vi.fn(async () => ({ ok: true }))
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
})

