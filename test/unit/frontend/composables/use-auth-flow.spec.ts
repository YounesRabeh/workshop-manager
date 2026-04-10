/** @vitest-environment jsdom */

import { describe, expect, it, vi, beforeEach } from 'vitest'
import { useAuthFlow } from '@frontend/composables/useAuthFlow'

describe('useAuthFlow composable', () => {
  type ProfilesPayload = {
    profiles: unknown[]
    rememberedUsername: string
    rememberAuth: boolean
    hasStoredAuth: boolean
    preferredAuthMode?: 'otp' | 'steam_guard_mobile'
  }

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
    getProfiles: vi.fn<() => Promise<ProfilesPayload>>(async () => ({
      profiles: [],
      rememberedUsername: 'alice',
      rememberAuth: false,
      hasStoredAuth: false,
      preferredAuthMode: 'otp'
    })),
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
      type: 'run_started',
      phase: 'login'
    })
    flow.handleRunEvent({
      runId: 'r1',
      ts: Date.now(),
      type: 'steam_guard_required',
      phase: 'login',
      promptType: 'steam_guard_code'
    })

    expect(flow.steamGuardPromptType.value).toBe('steam_guard_code')
    expect(flow.activeChallengeMode.value).toBe('otp')
    expect(flow.statusMessage.value).toContain('OTP / Email code')
  })

  it('ignores steam guard-like output from non-login or stale runs', () => {
    const flow = useAuthFlow({
      onShowTimeoutLogs: vi.fn(async () => undefined),
      onHideTimeoutLogs: vi.fn(),
      onSignedIn: vi.fn(async () => undefined),
      onSignedOut: vi.fn()
    })

    flow.handleRunEvent({
      runId: 'login-run',
      ts: Date.now(),
      type: 'run_started',
      phase: 'login'
    })
    flow.handleRunEvent({
      runId: 'update-run',
      ts: Date.now(),
      type: 'stdout',
      phase: 'update',
      line: 'Steam Guard mobile authenticator'
    })
    flow.handleRunEvent({
      runId: 'other-login-run',
      ts: Date.now(),
      type: 'stdout',
      phase: 'login',
      line: 'auth code'
    })

    expect(flow.steamGuardPromptType.value).toBe('waiting')
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

  it('clears stored session before quitting when keep-signed-in is disabled', async () => {
    const flow = useAuthFlow({
      onShowTimeoutLogs: vi.fn(async () => undefined),
      onHideTimeoutLogs: vi.fn(),
      onSignedIn: vi.fn(async () => undefined),
      onSignedOut: vi.fn()
    })

    flow.loginForm.rememberAuth = false
    flow.hasPersistedStoredSession.value = true

    await flow.quitApp()

    expect(workshop.clearStoredSession).toHaveBeenCalledTimes(1)
    expect(workshop.quitApp).toHaveBeenCalledTimes(1)
  })

  it('does not quit when stored-session cleanup fails', async () => {
    workshop.clearStoredSession.mockRejectedValueOnce(new Error('[command_failed] Could not clear stored session'))

    const flow = useAuthFlow({
      onShowTimeoutLogs: vi.fn(async () => undefined),
      onHideTimeoutLogs: vi.fn(),
      onSignedIn: vi.fn(async () => undefined),
      onSignedOut: vi.fn()
    })

    flow.loginForm.rememberAuth = false
    flow.hasPersistedStoredSession.value = true

    await flow.quitApp()

    expect(workshop.clearStoredSession).toHaveBeenCalledTimes(1)
    expect(workshop.quitApp).not.toHaveBeenCalled()
    expect(flow.statusMessage.value).toContain('Clear session failed')
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

  it('notifies app shell to open advanced options when SteamCMD path is missing', async () => {
    workshop.login.mockRejectedValueOnce(new Error('[install] SteamCMD executable is not configured yet'))
    const onSteamCmdPathRequired = vi.fn()

    const flow = useAuthFlow({
      onShowTimeoutLogs: vi.fn(async () => undefined),
      onHideTimeoutLogs: vi.fn(),
      onSignedIn: vi.fn(async () => undefined),
      onSignedOut: vi.fn(),
      onSteamCmdPathRequired
    })

    flow.loginForm.username = 'alice'
    flow.loginForm.password = 'secret'
    await flow.login()

    expect(onSteamCmdPathRequired).toHaveBeenCalledTimes(1)
    expect(flow.statusMessage.value).toBe('SteamCMD not found. Advanced options opened. Add the SteamCMD executable path.')
  })

  it('hydrates remembered username state from profiles payload', async () => {
    const flow = useAuthFlow({
      onShowTimeoutLogs: vi.fn(async () => undefined),
      onHideTimeoutLogs: vi.fn(),
      onSignedIn: vi.fn(async () => undefined),
      onSignedOut: vi.fn()
    })

    flow.loginForm.username = 'temp-user'
    flow.loginForm.rememberUsername = false

    await flow.refreshRememberedLoginState()

    expect(flow.loginForm.username).toBe('alice')
    expect(flow.loginForm.rememberUsername).toBe(true)
    expect(flow.loginForm.rememberAuth).toBe(false)
  })

  it('hydrates preferred auth mode from profiles payload and defaults to otp', async () => {
    workshop.getProfiles.mockResolvedValueOnce({
      profiles: [],
      rememberedUsername: 'alice',
      rememberAuth: false,
      hasStoredAuth: false,
      preferredAuthMode: 'steam_guard_mobile'
    })

    const flow = useAuthFlow({
      onShowTimeoutLogs: vi.fn(async () => undefined),
      onHideTimeoutLogs: vi.fn(),
      onSignedIn: vi.fn(async () => undefined),
      onSignedOut: vi.fn()
    })

    await flow.refreshRememberedLoginState()
    expect(flow.preferredAuthMode.value).toBe('steam_guard_mobile')

    workshop.getProfiles.mockResolvedValueOnce({
      profiles: [],
      rememberedUsername: 'alice',
      rememberAuth: false,
      hasStoredAuth: false,
      preferredAuthMode: undefined
    })
    await flow.refreshRememberedLoginState()
    expect(flow.preferredAuthMode.value).toBe('otp')
  })

  it('submits preferred auth mode with login payload', async () => {
    const flow = useAuthFlow({
      onShowTimeoutLogs: vi.fn(async () => undefined),
      onHideTimeoutLogs: vi.fn(),
      onSignedIn: vi.fn(async () => undefined),
      onSignedOut: vi.fn()
    })

    flow.loginForm.username = 'alice'
    flow.loginForm.password = 'secret'
    flow.setPreferredAuthMode('steam_guard_mobile')
    await flow.login()

    expect(workshop.login).toHaveBeenCalledWith(
      expect.objectContaining({
        preferredAuthMode: 'steam_guard_mobile'
      })
    )
  })

  it('auto-switches challenge copy when steam requests OTP while mobile is preferred', () => {
    const flow = useAuthFlow({
      onShowTimeoutLogs: vi.fn(async () => undefined),
      onHideTimeoutLogs: vi.fn(),
      onSignedIn: vi.fn(async () => undefined),
      onSignedOut: vi.fn()
    })

    flow.setPreferredAuthMode('steam_guard_mobile')
    flow.handleRunEvent({
      runId: 'r1',
      ts: Date.now(),
      type: 'run_started',
      phase: 'login'
    })
    flow.handleRunEvent({
      runId: 'r1',
      ts: Date.now(),
      type: 'steam_guard_required',
      phase: 'login',
      promptType: 'steam_guard_code'
    })

    expect(flow.activeChallengeMode.value).toBe('otp')
    expect(flow.statusMessage.value).toContain('Steam requested OTP / Email code')
  })

  it('detects OTP challenge from steamcmd usage output format while mobile is preferred', () => {
    const flow = useAuthFlow({
      onShowTimeoutLogs: vi.fn(async () => undefined),
      onHideTimeoutLogs: vi.fn(),
      onSignedIn: vi.fn(async () => undefined),
      onSignedOut: vi.fn()
    })

    flow.setPreferredAuthMode('steam_guard_mobile')
    flow.handleRunEvent({
      runId: 'r1',
      ts: Date.now(),
      type: 'run_started',
      phase: 'login'
    })
    flow.handleRunEvent({
      runId: 'r1',
      ts: Date.now(),
      type: 'stdout',
      phase: 'login',
      line: 'login <username> [<password>] [<Steam guard code>]'
    })

    expect(flow.activeChallengeMode.value).toBe('otp')
    expect(flow.statusMessage.value).toContain('Steam requested OTP / Email code')
  })

  it('marks verification approved when post-approval login progress arrives without explicit OK suffix', () => {
    const flow = useAuthFlow({
      onShowTimeoutLogs: vi.fn(async () => undefined),
      onHideTimeoutLogs: vi.fn(),
      onSignedIn: vi.fn(async () => undefined),
      onSignedOut: vi.fn()
    })

    flow.handleRunEvent({
      runId: 'r1',
      ts: Date.now(),
      type: 'run_started',
      phase: 'login'
    })
    flow.handleRunEvent({
      runId: 'r1',
      ts: Date.now(),
      type: 'steam_guard_required',
      phase: 'login',
      promptType: 'steam_guard_mobile'
    })
    flow.handleRunEvent({
      runId: 'r1',
      ts: Date.now(),
      type: 'stdout',
      phase: 'login',
      line: 'Waiting for user info...'
    })

    expect(flow.steamGuardPromptType.value).toBe('steam_guard_approved')
    expect(flow.statusMessage.value).toBe('Verification approved. Finalizing sign in...')
  })

  it('only submits OTP/email code when OTP challenge is active', async () => {
    const flow = useAuthFlow({
      onShowTimeoutLogs: vi.fn(async () => undefined),
      onHideTimeoutLogs: vi.fn(),
      onSignedIn: vi.fn(async () => undefined),
      onSignedOut: vi.fn()
    })

    flow.setSteamGuardCode('123456')
    await flow.submitSteamGuardCode()
    expect(workshop.submitSteamGuardCode).not.toHaveBeenCalled()

    flow.handleRunEvent({
      runId: 'r1',
      ts: Date.now(),
      type: 'run_started',
      phase: 'login'
    })
    flow.handleRunEvent({
      runId: 'r1',
      ts: Date.now(),
      type: 'steam_guard_required',
      phase: 'login',
      promptType: 'steam_guard_code'
    })
    flow.setSteamGuardCode('123456')
    await flow.submitSteamGuardCode()
    expect(workshop.submitSteamGuardCode).toHaveBeenCalledTimes(1)
  })

  it('queues OTP entered before login run id is available and submits when challenge arrives', async () => {
    const flow = useAuthFlow({
      onShowTimeoutLogs: vi.fn(async () => undefined),
      onHideTimeoutLogs: vi.fn(),
      onSignedIn: vi.fn(async () => undefined),
      onSignedOut: vi.fn()
    })

    flow.isLoginSubmitting.value = true
    flow.setPreferredAuthMode('otp')
    flow.setSteamGuardCode('123456')
    await flow.submitSteamGuardCode()

    expect(workshop.submitSteamGuardCode).not.toHaveBeenCalled()
    expect(flow.steamGuardCode.value).toBe('')
    expect(flow.statusMessage.value).toContain('Waiting for login session')

    flow.handleRunEvent({
      runId: 'r1',
      ts: Date.now(),
      type: 'run_started',
      phase: 'login'
    })
    flow.handleRunEvent({
      runId: 'r1',
      ts: Date.now(),
      type: 'steam_guard_required',
      phase: 'login',
      promptType: 'steam_guard_code'
    })

    await vi.waitFor(() => {
      expect(workshop.submitSteamGuardCode).toHaveBeenCalledWith({
        sessionId: 'r1',
        code: '123456'
      })
    })
  })

  it('keeps saved-session login available for the current sign-in after turning off keep-signed-in', async () => {
    workshop.getProfiles.mockResolvedValueOnce({
      profiles: [],
      rememberedUsername: 'alice',
      rememberAuth: true,
      hasStoredAuth: true,
      preferredAuthMode: 'otp'
    })

    const flow = useAuthFlow({
      onShowTimeoutLogs: vi.fn(async () => undefined),
      onHideTimeoutLogs: vi.fn(),
      onSignedIn: vi.fn(async () => undefined),
      onSignedOut: vi.fn()
    })

    await flow.refreshRememberedLoginState()
    flow.loginForm.rememberAuth = false

    await flow.login()

    expect(workshop.login).toHaveBeenCalledWith(
      expect.objectContaining({
        username: 'alice',
        password: '',
        rememberAuth: false,
        useStoredAuth: true
      })
    )
  })

  it('requires password again after signing out from a saved-session login with keep-signed-in disabled', async () => {
    workshop.getProfiles.mockResolvedValueOnce({
      profiles: [],
      rememberedUsername: 'alice',
      rememberAuth: true,
      hasStoredAuth: true,
      preferredAuthMode: 'otp'
    })

    const flow = useAuthFlow({
      onShowTimeoutLogs: vi.fn(async () => undefined),
      onHideTimeoutLogs: vi.fn(),
      onSignedIn: vi.fn(async () => undefined),
      onSignedOut: vi.fn()
    })

    await flow.refreshRememberedLoginState()
    flow.loginForm.rememberAuth = false

    await flow.login()
    await flow.signOut()

    workshop.login.mockClear()
    await flow.login()

    expect(workshop.login).not.toHaveBeenCalled()
    expect(flow.statusMessage.value).toBe('Enter your password to sign in.')
  })
})
