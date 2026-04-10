/** @vitest-environment jsdom */

import { describe, expect, it, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import App from '@frontend/App.vue'
import type { PersistedRunLog } from '@shared/contracts'

const workshop = {
  ensureSteamCmdInstalled: vi.fn(async () => ({
    installed: true,
    executablePath: '/managed/steamcmd.sh',
    source: 'auto'
  })),
  getAppVersion: vi.fn(async () => ({ version: '0.1.0' })),
  login: vi.fn(async () => ({ sessionId: 's1' })),
  quitApp: vi.fn(async () => ({ ok: true })),
  logout: vi.fn(async () => ({ ok: true })),
  clearStoredSession: vi.fn(async () => ({ ok: true })),
  submitSteamGuardCode: vi.fn(async () => ({ ok: true })),
  uploadMod: vi.fn(async () => ({ runId: 'r1', success: true, publishedFileId: undefined as string | undefined })),
  updateMod: vi.fn(async () => ({ runId: 'r2', success: true })),
  updateVisibility: vi.fn(async () => ({ runId: 'r3', success: true })),
  getProfiles: vi.fn(async () => ({
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
  getInstallLog: vi.fn(async () => ({
    path: '/tmp/steamcmd-install.log',
    content: '[install] example log',
    exists: true
  })),
  saveAdvancedSettings: vi.fn(async (payload: {
    webApiEnabled: boolean
    webApiKey?: string
    clearWebApiKey?: boolean
    steamCmdManualPath?: string
    timeouts?: {
      loginTimeoutMs?: number
      storedSessionTimeoutMs?: number
      workshopTimeoutMs?: number
    }
  }) => ({
    webApiEnabled: payload.webApiEnabled,
    hasWebApiKey: Boolean(payload.webApiKey && payload.webApiKey.trim().length > 0 && !payload.clearWebApiKey),
    secureStorageAvailable: true,
    steamCmdManualPath: payload.steamCmdManualPath?.trim() || undefined,
    steamCmdInstalled: true,
    steamCmdSource: payload.steamCmdManualPath?.trim() ? 'manual' : 'auto',
    timeouts: {
      loginTimeoutMs: payload.timeouts?.loginTimeoutMs ?? 30_000,
      storedSessionTimeoutMs: payload.timeouts?.storedSessionTimeoutMs ?? 10_000,
      workshopTimeoutMs: payload.timeouts?.workshopTimeoutMs ?? 60_000
    }
  })),
  getCurrentProfile: vi.fn(async () => ({
    steamId64: '76561197960265729',
    personaName: 'Alice Persona',
    avatarUrl: 'https://example.invalid/avatar.png',
    profileUrl: 'https://steamcommunity.com/profiles/76561197960265729'
  })),
  getMyWorkshopItems: vi.fn(async () => [
    {
      publishedFileId: '123',
      title: 'Test Item',
      appId: '480',
      previewUrl: 'https://example.invalid/preview.jpg'
    }
  ]),
  listContentFolderFiles: vi.fn(
    async () => [] as Array<{ absolutePath: string; relativePath: string; sizeBytes: number }>
  ),
  openPath: vi.fn(async () => ({ ok: true })),
  saveProfile: vi.fn(async ({ profile }) => profile),
  deleteProfile: vi.fn(async () => ({ ok: true })),
  getRunLogs: vi.fn<() => Promise<PersistedRunLog[]>>(async () => []),
  getRunLog: vi.fn<(runId: string) => Promise<PersistedRunLog | null>>(async () => null),
  pickFolder: vi.fn(async () => '/mods'),
  pickFile: vi.fn(async () => '/mods/preview.png'),
  pickSteamCmdExecutable: vi.fn(async () => '/tools/steamcmd.sh'),
  onRunEvent: vi.fn((_: (event: unknown) => void) => () => undefined)
}

describe('App UI validation gates', () => {
  const findPrimaryActionButton = (
    wrapper: ReturnType<typeof mount>,
    label: string
  ) =>
    wrapper
      .findAll('button')
      .find(
        (button) =>
          button.text().trim() === label &&
          (button.attributes('class') ?? '').includes('w-full')
      )

  const findConfirmUpdateButton = (wrapper: ReturnType<typeof mount>) =>
    wrapper
      .findAll('button')
      .find(
        (button) =>
          button.text().trim() === 'Update Item' &&
          !(button.attributes('class') ?? '').includes('w-full')
      )

  const openUpdateTab = async (wrapper: ReturnType<typeof mount>) => {
    const updateTab = wrapper.findAll('button').find((button) => button.text().trim() === 'Update')
    expect(updateTab).toBeDefined()
    expect(updateTab?.attributes('disabled')).toBeUndefined()
    await updateTab?.trigger('click')
    await flushPromises()
  }

  beforeEach(() => {
    vi.clearAllMocks()
    ;(window as unknown as { workshop: typeof workshop }).workshop = workshop
  })

  it('keeps update disabled with selected item defaults and keeps create disabled until required fields are present', async () => {
    const wrapper = mount(App)
    await flushPromises()

    const username = wrapper.find('input')
    const password = wrapper.find('input[type="password"]')
    await username.setValue('alice')
    await password.setValue('secret')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    await openUpdateTab(wrapper)

    const updateButton = findPrimaryActionButton(wrapper, 'Update Item')
    expect(updateButton?.attributes('disabled')).toBeDefined()

    const createTab = wrapper.findAll('button').find((button) => button.text().trim() === 'Create')
    expect(createTab).toBeDefined()
    await createTab?.trigger('click')
    await flushPromises()

    const createButton = wrapper.findAll('button').find((button) => button.text().includes('Create New Item'))
    expect(createButton?.attributes('disabled')).toBeDefined()
  })

  it('shows workshop fetch failures in the signed-in shell instead of the generic empty state', async () => {
    workshop.getMyWorkshopItems.mockRejectedValueOnce(
      new Error(
        '[auth] Signed in to Steam, but account identity could not be resolved on this platform. Workshop loading cannot continue until Steam ID resolution succeeds.'
      )
    )

    const wrapper = mount(App)
    await flushPromises()

    const username = wrapper.find('input')
    const password = wrapper.find('input[type="password"]')
    await username.setValue('alice')
    await password.setValue('secret')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('Workshop list failed (auth): Signed in to Steam, but account identity could not be resolved on this platform.')
    expect(wrapper.text()).not.toContain('No workshop items found for the current filters.')
  })

  it('renders loaded workshop items in the Workshop Items section after login', async () => {
    const wrapper = mount(App)
    await flushPromises()

    const username = wrapper.find('input')
    const password = wrapper.find('input[type="password"]')
    await username.setValue('alice')
    await password.setValue('secret')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('My Workshop Items')
    expect(wrapper.text()).toContain('Showing 1 of 1 item(s).')
    expect(wrapper.text()).toContain('Test Item')
    expect(wrapper.text()).toContain('ID: 123')
    expect(wrapper.text()).not.toContain('Steam login successful. Loading workshop items...')
    expect(wrapper.text()).not.toContain('Loaded 1 workshop item(s).')
  })

  it('keeps readiness layout tweaks: top row App ID + Title, separator visible, and no Published File ID in update', async () => {
    const wrapper = mount(App)
    await flushPromises()

    const username = wrapper.find('input')
    const password = wrapper.find('input[type="password"]')
    await username.setValue('alice')
    await password.setValue('secret')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    await openUpdateTab(wrapper)

    const updateButton = findPrimaryActionButton(wrapper, 'Update Item')
    expect(updateButton).toBeDefined()
    const updatePublishArticle = updateButton!.element.closest('article')
    expect(updatePublishArticle).toBeTruthy()

    const updateReadinessLists = updatePublishArticle!.querySelectorAll('div.rounded-xl ul')
    expect(updateReadinessLists.length).toBeGreaterThanOrEqual(2)
    const updateTopLabels = [...updateReadinessLists[0].querySelectorAll('li > span:first-child')].map((node) =>
      (node.textContent ?? '').trim()
    )
    expect(updateTopLabels).toEqual(['App ID', 'Title'])

    const updateAllReadinessLabels = [...updatePublishArticle!.querySelectorAll('div.rounded-xl li > span:first-child')].map((node) =>
      (node.textContent ?? '').trim()
    )
    expect(updateAllReadinessLabels).not.toContain('Published File ID')

    const updateSeparator = [...updatePublishArticle!.querySelectorAll('div')].find(
      (node) =>
        node.className.includes('border-t') &&
        node.className.includes('border-[#365572]/70')
    )
    expect(updateSeparator).toBeTruthy()

    const createTab = wrapper.findAll('button').find((button) => button.text().trim() === 'Create')
    expect(createTab).toBeDefined()
    await createTab?.trigger('click')
    await flushPromises()

    const createButton = wrapper.findAll('button').find((button) => button.text().includes('Create New Item'))
    expect(createButton).toBeDefined()
    const createPublishArticle = createButton!.element.closest('article')
    expect(createPublishArticle).toBeTruthy()

    const createReadinessLists = createPublishArticle!.querySelectorAll('div.rounded-xl ul')
    expect(createReadinessLists.length).toBeGreaterThanOrEqual(2)
    const createTopLabels = [...createReadinessLists[0].querySelectorAll('li > span:first-child')].map((node) =>
      (node.textContent ?? '').trim()
    )
    expect(createTopLabels).toEqual(['App ID', 'Title', 'Content folder'])

    const createSeparator = [...createPublishArticle!.querySelectorAll('div')].find(
      (node) =>
        node.className.includes('border-t') &&
        node.className.includes('border-[#365572]/70')
    )
    expect(createSeparator).toBeTruthy()
  })

  it('hydrates remembered username without persisting password', async () => {
    const wrapper = mount(App)
    await flushPromises()

    const usernameInput = wrapper.find('input')
    const passwordInput = wrapper.find('input[type="password"]')

    expect((usernameInput.element as HTMLInputElement).value).toBe('alice')
    expect((passwordInput.element as HTMLInputElement).value).toBe('')
  })

  it('toggles login password visibility on button click', async () => {
    const wrapper = mount(App)
    await flushPromises()

    const passwordInput = wrapper.find('input[type="password"]')
    expect(passwordInput.exists()).toBe(true)

    const toggleButton = wrapper
      .findAll('button')
      .find((button) => button.text().trim() === 'Show')
    expect(toggleButton).toBeDefined()
    await toggleButton?.trigger('click')
    await flushPromises()

    const revealedPasswordInput = wrapper.find('input[type="text"][autocomplete="current-password"]')
    expect(revealedPasswordInput.exists()).toBe(true)

    const hideButton = wrapper
      .findAll('button')
      .find((button) => button.text().trim() === 'Hide')
    expect(hideButton).toBeDefined()
    await hideButton?.trigger('click')
    await flushPromises()

    expect(wrapper.find('input[type="password"]').exists()).toBe(true)
  })

  it('renders preferred verification mode selector and submits chosen mode', async () => {
    const wrapper = mount(App)
    await flushPromises()

    const mobileModeRadio = wrapper.find('input[type="radio"][value="steam_guard_mobile"]')
    expect(mobileModeRadio.exists()).toBe(true)
    await mobileModeRadio.setValue(true)
    await flushPromises()

    const username = wrapper.find('input')
    const password = wrapper.find('input[type="password"]')
    await username.setValue('alice')
    await password.setValue('secret')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(workshop.login).toHaveBeenCalledWith(
      expect.objectContaining({
        preferredAuthMode: 'steam_guard_mobile'
      })
    )
  })

  it('shows OTP/email security card when Steam requests code verification', async () => {
    const wrapper = mount(App)
    await flushPromises()

    const runEventListener = workshop.onRunEvent.mock.calls[0]?.[0] as
      | ((event: { runId: string; ts: number; type: string; phase?: string; promptType?: string }) => void)
      | undefined
    expect(runEventListener).toBeDefined()

    runEventListener?.({
      runId: 'login-run',
      ts: Date.now(),
      type: 'run_started',
      phase: 'login'
    })
    runEventListener?.({
      runId: 'login-run',
      ts: Date.now(),
      type: 'steam_guard_required',
      phase: 'login',
      promptType: 'steam_guard_code'
    })
    await flushPromises()

    expect(wrapper.text()).toContain('OTP / Email code required')
    expect(wrapper.text()).toContain('Submit OTP / Email code')
  })

  it('shows mobile approval copy when Steam requests app confirmation', async () => {
    const wrapper = mount(App)
    await flushPromises()

    const runEventListener = workshop.onRunEvent.mock.calls[0]?.[0] as
      | ((event: { runId: string; ts: number; type: string; phase?: string; promptType?: string }) => void)
      | undefined
    expect(runEventListener).toBeDefined()

    runEventListener?.({
      runId: 'login-run',
      ts: Date.now(),
      type: 'run_started',
      phase: 'login'
    })
    runEventListener?.({
      runId: 'login-run',
      ts: Date.now(),
      type: 'steam_guard_required',
      phase: 'login',
      promptType: 'steam_guard_mobile'
    })
    await flushPromises()

    expect(wrapper.text()).toContain('Auth received')
    expect(wrapper.text()).toContain('Open Steam on your phone and approve this sign-in request.')
    expect(wrapper.text()).not.toContain('CHECK YOUR STEAM GUARD APP')
  })

  it('clears saved session from login panel', async () => {
    workshop.getProfiles.mockResolvedValueOnce({
      profiles: [],
      rememberedUsername: 'alice',
      rememberAuth: true,
      hasStoredAuth: true,
      preferredAuthMode: 'otp'
    })

    const wrapper = mount(App)
    await flushPromises()

    const clearSessionButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Clear saved session'))
    expect(clearSessionButton).toBeDefined()
    await clearSessionButton?.trigger('click')
    await flushPromises()

    expect(workshop.clearStoredSession).toHaveBeenCalledTimes(1)
  })

  it('quits app from login section', async () => {
    const wrapper = mount(App)
    await flushPromises()

    const quitButton = wrapper
      .findAll('button')
      .find((button) => button.text().trim() === 'Quit')
    expect(quitButton).toBeDefined()
    await quitButton?.trigger('click')
    await flushPromises()

    expect(workshop.quitApp).toHaveBeenCalledTimes(1)
  })

  it('clears saved session before quitting after keep-signed-in is unticked', async () => {
    workshop.getProfiles.mockResolvedValueOnce({
      profiles: [],
      rememberedUsername: 'alice',
      rememberAuth: true,
      hasStoredAuth: true,
      preferredAuthMode: 'otp'
    })

    const wrapper = mount(App)
    await flushPromises()

    const checkboxes = wrapper.findAll('input[type="checkbox"]')
    expect(checkboxes.length).toBeGreaterThanOrEqual(2)
    await checkboxes[1].setValue(false)
    await flushPromises()

    const quitButton = wrapper
      .findAll('button')
      .find((button) => button.text().trim() === 'Quit')
    expect(quitButton).toBeDefined()
    await quitButton?.trigger('click')
    await flushPromises()

    expect(workshop.clearStoredSession).toHaveBeenCalledTimes(1)
    expect(workshop.quitApp).toHaveBeenCalledTimes(1)
  })

  it('shows only the install log open action when SteamCMD install fails during bootstrap', async () => {
    workshop.ensureSteamCmdInstalled.mockRejectedValueOnce(
      new Error('[install] SteamCMD was downloaded but executable validation failed')
    )

    const wrapper = mount(App)
    await flushPromises()

    expect(wrapper.text()).not.toContain('SteamCMD Install Log')
    expect(wrapper.text()).not.toContain('/tmp/steamcmd-install.log')
    expect(wrapper.text()).not.toContain('[install] example log')

    const openLogButton = wrapper
      .findAll('button')
      .find((button) => button.text().trim() === 'Open Log File')
    expect(openLogButton).toBeDefined()
    await openLogButton?.trigger('click')
    await flushPromises()

    expect(workshop.openPath).toHaveBeenCalledWith({ path: '/tmp/steamcmd-install.log' })
  })

  it('keeps clear saved session disabled when only checkbox is ticked locally', async () => {
    const wrapper = mount(App)
    await flushPromises()

    const checkboxes = wrapper.findAll('input[type="checkbox"]')
    expect(checkboxes.length).toBeGreaterThanOrEqual(2)
    await checkboxes[1].setValue(true)
    await flushPromises()

    const clearSessionButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Clear saved session'))
    expect(clearSessionButton).toBeDefined()
    expect(clearSessionButton?.attributes('disabled')).toBeDefined()
  })

  it('keeps normal password login when keep-signed-in is checked without stored session', async () => {
    const wrapper = mount(App)
    await flushPromises()

    const usernameInput = wrapper.find('input')
    await usernameInput.setValue('alice')

    const checkboxes = wrapper.findAll('input[type="checkbox"]')
    expect(checkboxes.length).toBeGreaterThanOrEqual(2)
    await checkboxes[1].setValue(true)
    await flushPromises()

    const passwordInput = wrapper.find('input[type="password"]')
    expect(passwordInput.attributes('placeholder') ?? '').toBe('')
    expect(wrapper.text()).toContain('No saved session found yet. Enter password to sign in and create one.')

    const submitButton = wrapper.findAll('button').find((button) => button.text().trim() === 'Sign in')
    expect(submitButton).toBeDefined()
    expect(submitButton?.attributes('disabled')).toBeDefined()

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(workshop.login).not.toHaveBeenCalled()
    expect((wrapper.vm as unknown as { statusMessage: string }).statusMessage).toBe('Enter your password to sign in.')
  })

  it('toggles remember checkboxes on Enter without submitting login', async () => {
    const wrapper = mount(App)
    await flushPromises()

    const checkboxes = wrapper.findAll('input[type="checkbox"]')
    expect(checkboxes.length).toBeGreaterThanOrEqual(2)

    const rememberUsername = checkboxes[0]
    expect((rememberUsername.element as HTMLInputElement).checked).toBe(true)

    await rememberUsername.trigger('keydown', { key: 'Enter' })
    await flushPromises()

    expect((rememberUsername.element as HTMLInputElement).checked).toBe(false)
    expect(workshop.login).not.toHaveBeenCalled()
  })

  it('does not auto-focus sign in while typing credentials without stored session', async () => {
    const wrapper = mount(App, { attachTo: document.body })
    try {
      await flushPromises()

      const passwordInput = wrapper.find('input[type="password"]')
      expect(passwordInput.exists()).toBe(true)
      ;(passwordInput.element as HTMLInputElement).focus()
      expect(document.activeElement).toBe(passwordInput.element)

      await passwordInput.setValue('s')
      await flushPromises()

      expect(document.activeElement).toBe(passwordInput.element)

      const submitButton = wrapper.findAll('button').find((button) => button.text().trim() === 'Sign in')
      expect(submitButton).toBeDefined()
      expect(document.activeElement).not.toBe(submitButton?.element ?? null)
    } finally {
      wrapper.unmount()
    }
  })

  it('uses saved-session mode only when stored auth exists', async () => {
    workshop.getProfiles.mockResolvedValueOnce({
      profiles: [],
      rememberedUsername: 'alice',
      rememberAuth: true,
      hasStoredAuth: true,
      preferredAuthMode: 'otp'
    })

    const wrapper = mount(App)
    await flushPromises()

    const passwordInput = wrapper.find('input[type="password"]')
    expect(passwordInput.attributes('placeholder')).toBe('********')
    expect(wrapper.text()).not.toContain('No saved session found yet. Enter password to sign in and create one.')

    const submitButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Sign in with saved session'))
    expect(submitButton).toBeDefined()
    expect(submitButton?.attributes('disabled')).toBeUndefined()

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(workshop.login).toHaveBeenCalledWith(
      expect.objectContaining({
        username: 'alice',
        password: '',
        rememberAuth: true,
        useStoredAuth: true
      })
    )
  })

  it('keeps current saved-session login available after unticking keep-signed-in', async () => {
    workshop.getProfiles.mockResolvedValueOnce({
      profiles: [],
      rememberedUsername: 'alice',
      rememberAuth: true,
      hasStoredAuth: true,
      preferredAuthMode: 'otp'
    })

    const wrapper = mount(App)
    await flushPromises()

    const checkboxes = wrapper.findAll('input[type="checkbox"]')
    expect(checkboxes.length).toBeGreaterThanOrEqual(2)
    await checkboxes[1].setValue(false)
    await flushPromises()

    const passwordInput = wrapper.find('input[type="password"]')
    expect(passwordInput.attributes('placeholder')).toBe('********')

    const submitButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Sign in with saved session'))
    expect(submitButton).toBeDefined()
    expect(submitButton?.attributes('disabled')).toBeUndefined()

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(workshop.login).toHaveBeenCalledWith(
      expect.objectContaining({
        username: 'alice',
        password: '',
        rememberAuth: false,
        useStoredAuth: true
      })
    )
  })

  it('keeps saved-session login messaging generic before any steam guard challenge is requested', async () => {
    workshop.getProfiles.mockResolvedValueOnce({
      profiles: [],
      rememberedUsername: 'alice',
      rememberAuth: true,
      hasStoredAuth: true,
      preferredAuthMode: 'steam_guard_mobile'
    })
    workshop.login.mockImplementationOnce(async () => await new Promise(() => undefined))

    const wrapper = mount(App)
    await flushPromises()

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('Fetching saved Steam session. Steam Guard may be required if Steam requests verification.')
    expect(wrapper.text()).not.toContain('CHECK YOUR STEAM GUARD APP')
    expect(wrapper.text()).not.toContain('Save OTP / Email code')
  })

  it('shows dedicated logs section when login times out', async () => {
    const timeoutRun = {
      runId: '1700000000000-timeout',
      success: false,
      steamOutputSummary: 'SteamCMD run exceeded timeout (10000ms)',
      logPath: '/tmp/steamcmd-output.log',
      lines: ['[RUN_META] timeout reached after 10000ms, restarting SteamCMD process'],
      status: 'failed' as const
    }

    workshop.login.mockRejectedValueOnce(new Error('[timeout] SteamCMD run exceeded timeout (10000ms)'))
    workshop.getRunLogs.mockResolvedValueOnce([timeoutRun])
    workshop.getRunLog.mockResolvedValueOnce(timeoutRun)

    const wrapper = mount(App)
    await flushPromises()

    const username = wrapper.find('input')
    const password = wrapper.find('input[type="password"]')
    await username.setValue('alice')
    await password.setValue('secret')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(workshop.getRunLogs).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('Dedicated Logs')
    expect(wrapper.text()).toContain('SteamCMD run exceeded timeout (10000ms)')
  })

  it('forces rememberUsername when keep-signed-in is enabled', async () => {
    const wrapper = mount(App)
    await flushPromises()

    const username = wrapper.find('input')
    const password = wrapper.find('input[type="password"]')
    await username.setValue('alice')
    await password.setValue('secret')

    const checkboxes = wrapper.findAll('input[type="checkbox"]')
    expect(checkboxes.length).toBeGreaterThanOrEqual(2)
    await checkboxes[0].setValue(false)
    await checkboxes[1].setValue(true)
    await flushPromises()

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(workshop.login).toHaveBeenCalledWith(
      expect.objectContaining({
        username: 'alice',
        rememberAuth: true,
        rememberUsername: true
      })
    )
  })

  it('loads profile avatar/name after login', async () => {
    const wrapper = mount(App)
    await flushPromises()

    const username = wrapper.find('input')
    const password = wrapper.find('input[type="password"]')
    await username.setValue('alice')
    await password.setValue('secret')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(workshop.getCurrentProfile).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('Alice Persona')
    expect(wrapper.text()).not.toContain('DEV')

    const avatar = wrapper.find('.session-avatar')
    expect(avatar.exists()).toBe(true)
    expect(avatar.attributes('src')).toContain('https://example.invalid/avatar.png')
  })

  it('shows DEV badge in top bar when a saved web api key is present', async () => {
    workshop.getAdvancedSettings.mockResolvedValueOnce({
      webApiEnabled: true,
      hasWebApiKey: true,
      secureStorageAvailable: true,
      steamCmdManualPath: undefined,
      steamCmdInstalled: true,
      steamCmdSource: 'auto',
      timeouts: {
        loginTimeoutMs: 30_000,
        storedSessionTimeoutMs: 10_000,
        workshopTimeoutMs: 60_000
      }
    })

    const wrapper = mount(App)
    await flushPromises()

    const username = wrapper.find('input')
    const password = wrapper.find('input[type="password"]')
    await username.setValue('alice')
    await password.setValue('secret')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('DEV')
    expect(wrapper.find('[aria-label="Dev mode enabled"]').exists()).toBe(true)
  })

  it('shows app version in About modal and not in top bar session meta', async () => {
    const wrapper = mount(App)
    await flushPromises()

    const username = wrapper.find('input')
    const password = wrapper.find('input[type="password"]')
    await username.setValue('alice')
    await password.setValue('secret')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).not.toContain('v0.1.0')

    const aboutButton = wrapper
      .findAll('button')
      .find((button) => button.text().trim() === 'About')
    expect(aboutButton).toBeDefined()
    await aboutButton?.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toMatch(/Version:\s*v0\.1\.0/)
  })

  it('opens the signed-in settings stage and saves timeout settings', async () => {
    const wrapper = mount(App)
    await flushPromises()

    const username = wrapper.find('input')
    const password = wrapper.find('input[type="password"]')
    await username.setValue('alice')
    await password.setValue('secret')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    const settingsButton = wrapper
      .findAll('button')
      .find((button) => button.text().trim() === 'Settings')
    expect(settingsButton).toBeDefined()
    await settingsButton?.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Application Settings')
    expect(wrapper.find('input[placeholder="Path to executable"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Steam Web API Key')
    expect(wrapper.find('input[placeholder="Paste key..."]').exists()).toBe(false)

    const timeoutInputs = wrapper.findAll('input[type="number"]')
    expect(timeoutInputs).toHaveLength(3)
    expect((timeoutInputs[0]!.element as HTMLInputElement).value).toBe('30')
    expect((timeoutInputs[1]!.element as HTMLInputElement).value).toBe('10')
    expect((timeoutInputs[2]!.element as HTMLInputElement).value).toBe('60')
    await timeoutInputs[0].setValue('45')
    await timeoutInputs[1].setValue('15')
    await timeoutInputs[2].setValue('120')

    const saveButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Save Settings'))
    expect(saveButton).toBeDefined()
    await saveButton?.trigger('click')
    await flushPromises()

    expect(workshop.saveAdvancedSettings).toHaveBeenCalledWith({
      webApiEnabled: false,
      webApiKey: undefined,
      steamCmdManualPath: '',
      timeouts: {
        loginTimeoutMs: 45_000,
        storedSessionTimeoutMs: 15_000,
        workshopTimeoutMs: 120_000
      }
    })
  })

  it('can disable saved-session and workshop timeouts in the signed-in settings stage', async () => {
    const wrapper = mount(App)
    await flushPromises()

    const username = wrapper.find('input')
    const password = wrapper.find('input[type="password"]')
    await username.setValue('alice')
    await password.setValue('secret')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    const settingsButton = wrapper
      .findAll('button')
      .find((button) => button.text().trim() === 'Settings')
    expect(settingsButton).toBeDefined()
    await settingsButton?.trigger('click')
    await flushPromises()

    const timeoutToggles = wrapper.findAll('.advanced-timeout-toggle input[type="checkbox"]')
    expect(timeoutToggles).toHaveLength(3)
    await timeoutToggles[1]!.setValue(true)
    await timeoutToggles[2]!.setValue(true)
    await flushPromises()

    const timeoutInputs = wrapper.findAll('input[type="number"]')
    expect(timeoutInputs).toHaveLength(3)
    expect(timeoutInputs[1]!.attributes('disabled')).toBeDefined()
    expect(timeoutInputs[2]!.attributes('disabled')).toBeDefined()

    const saveButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Save Settings'))
    expect(saveButton).toBeDefined()
    await saveButton?.trigger('click')
    await flushPromises()

    expect(workshop.saveAdvancedSettings).toHaveBeenCalledWith({
      webApiEnabled: false,
      webApiKey: undefined,
      steamCmdManualPath: '',
      timeouts: {
        loginTimeoutMs: 30_000,
        storedSessionTimeoutMs: 0,
        workshopTimeoutMs: 0
      }
    })
  })

  it('shows only login timeout in the login advanced options panel', async () => {
    const wrapper = mount(App)
    await flushPromises()

    const advancedToggle = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Advanced Developer Options'))
    expect(advancedToggle).toBeDefined()
    await advancedToggle?.trigger('click')
    await flushPromises()

    const timeoutInputs = wrapper.findAll('input[type="number"]')
    expect(timeoutInputs).toHaveLength(1)

    const cardTitles = wrapper.findAll('.advanced-card-title').map((node) => node.text().trim())
    expect(cardTitles).toEqual([
      'SteamCMD Timeouts',
      'SteamCMD Executable'
    ])
  })

  it('shows OTP entry immediately after sign-in request when OTP mode is selected', async () => {
    workshop.login.mockImplementationOnce(async () => await new Promise(() => undefined))

    const wrapper = mount(App)
    await flushPromises()

    const otpModeRadio = wrapper.find('input[type="radio"][value="otp"]')
    expect(otpModeRadio.exists()).toBe(true)
    await otpModeRadio.setValue(true)
    await flushPromises()

    const username = wrapper.find('input')
    const password = wrapper.find('input[type="password"]')
    await username.setValue('alice')
    await password.setValue('secret')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('Save OTP / Email code')
    expect(wrapper.text()).toContain('Sign-in request sent. You can enter OTP / Email code now')
  })

  it('keeps mobile mode sign-in in generic waiting copy before steam requests a challenge', async () => {
    workshop.login.mockImplementationOnce(async () => await new Promise(() => undefined))

    const wrapper = mount(App)
    await flushPromises()

    const mobileModeRadio = wrapper.find('input[type="radio"][value="steam_guard_mobile"]')
    expect(mobileModeRadio.exists()).toBe(true)
    await mobileModeRadio.setValue(true)
    await flushPromises()

    const username = wrapper.find('input')
    const password = wrapper.find('input[type="password"]')
    await username.setValue('alice')
    await password.setValue('secret')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('Waiting for Steam verification')
    expect(wrapper.text()).toContain('Steam auth request sent.')
    expect(wrapper.text()).toContain('CHECK YOUR STEAM GUARD APP')
    expect(wrapper.text()).not.toContain('Save OTP / Email code')
  })

  it('can disable the login timeout from the login advanced options panel', async () => {
    const wrapper = mount(App)
    await flushPromises()

    const advancedToggle = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Advanced Developer Options'))
    expect(advancedToggle).toBeDefined()
    await advancedToggle?.trigger('click')
    await flushPromises()

    const timeoutToggle = wrapper.find('.advanced-timeout-toggle input[type="checkbox"]')
    expect(timeoutToggle.exists()).toBe(true)
    await timeoutToggle.setValue(true)
    await flushPromises()

    const timeoutInput = wrapper.find('input[type="number"]')
    expect(timeoutInput.attributes('disabled')).toBeDefined()

    const saveButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Save Advanced Options'))
    expect(saveButton).toBeDefined()
    await saveButton?.trigger('click')
    await flushPromises()

    expect(workshop.saveAdvancedSettings).toHaveBeenCalledWith({
      webApiEnabled: false,
      webApiKey: undefined,
      steamCmdManualPath: '',
      timeouts: {
        loginTimeoutMs: 0,
        storedSessionTimeoutMs: 10_000,
        workshopTimeoutMs: 60_000
      }
    })
  })

  it('saves advanced web api settings from login panel', async () => {
    const wrapper = mount(App)
    await flushPromises()

    expect(wrapper.find('input[placeholder="Paste key..."]').exists()).toBe(false)
    const toggleButton = wrapper
      .findAll('button')
      .find((button) => button.text().trim() === 'Show API Options')
    expect(toggleButton).toBeDefined()
    await toggleButton?.trigger('click')
    await flushPromises()

    const apiKeyInput = wrapper.find('input[placeholder="Paste key..."]')
    expect(apiKeyInput.exists()).toBe(true)
    await apiKeyInput.setValue('dev-key-123')

    const saveButton = wrapper
      .findAll('button')
      .find((button) => button.text().trim() === 'Save API Key')
    expect(saveButton).toBeDefined()
    await saveButton?.trigger('click')
    await flushPromises()

    expect(workshop.saveAdvancedSettings).toHaveBeenCalledWith({
      webApiEnabled: true,
      webApiKey: 'dev-key-123',
      steamCmdManualPath: '',
      timeouts: {
        loginTimeoutMs: 30_000,
        storedSessionTimeoutMs: 10_000,
        workshopTimeoutMs: 60_000
      }
    })
  })

  it('toggles api key section visibility in credentials', async () => {
    const wrapper = mount(App)
    await flushPromises()

    expect(wrapper.find('input[placeholder="Paste key..."]').exists()).toBe(false)

    const showButton = wrapper
      .findAll('button')
      .find((button) => button.text().trim() === 'Show API Options')
    expect(showButton).toBeDefined()
    await showButton?.trigger('click')
    await flushPromises()

    expect(wrapper.find('input[placeholder="Paste key..."]').exists()).toBe(true)

    const hideButton = wrapper
      .findAll('button')
      .find((button) => button.text().trim() === 'Hide API Options')
    expect(hideButton).toBeDefined()
    await hideButton?.trigger('click')
    await flushPromises()

    expect(wrapper.find('input[placeholder="Paste key..."]').exists()).toBe(false)
  })

  it('saves advanced settings with no key without enabling web api', async () => {
    const wrapper = mount(App)
    await flushPromises()

    const advancedToggle = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Advanced Developer Options'))
    expect(advancedToggle).toBeDefined()
    await advancedToggle?.trigger('click')
    await flushPromises()

    const saveButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Save Advanced Options'))
    expect(saveButton).toBeDefined()
    await saveButton?.trigger('click')
    await flushPromises()

    expect(workshop.saveAdvancedSettings).toHaveBeenCalledWith({
      webApiEnabled: false,
      webApiKey: undefined,
      steamCmdManualPath: '',
      timeouts: {
        loginTimeoutMs: 30_000,
        storedSessionTimeoutMs: 10_000,
        workshopTimeoutMs: 60_000
      }
    })
  })

  it('clears saved web api key from credentials section', async () => {
    workshop.getAdvancedSettings.mockResolvedValueOnce({
      webApiEnabled: true,
      hasWebApiKey: true,
      secureStorageAvailable: true,
      steamCmdManualPath: undefined,
      steamCmdInstalled: true,
      steamCmdSource: 'auto',
      timeouts: {
        loginTimeoutMs: 30_000,
        storedSessionTimeoutMs: 10_000,
        workshopTimeoutMs: 60_000
      }
    })

    const wrapper = mount(App)
    await flushPromises()

    const toggleButton = wrapper
      .findAll('button')
      .find((button) => button.text().trim() === 'Show API Options')
    expect(toggleButton).toBeDefined()
    await toggleButton?.trigger('click')
    await flushPromises()

    const clearButton = wrapper
      .findAll('button')
      .find((button) => button.text().trim() === 'Clear Saved Key')
    expect(clearButton).toBeDefined()
    await clearButton?.trigger('click')
    await flushPromises()

    expect(workshop.saveAdvancedSettings).toHaveBeenCalledWith({
      webApiEnabled: true,
      clearWebApiKey: true
    })
  })

  it('browses and saves a manual SteamCMD path from advanced settings', async () => {
    const wrapper = mount(App)
    await flushPromises()

    const advancedToggle = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Advanced Developer Options'))
    expect(advancedToggle).toBeDefined()
    await advancedToggle?.trigger('click')
    await flushPromises()

    const browseButton = wrapper
      .findAll('button')
      .find((button) => button.text().trim() === 'Browse')
    expect(browseButton).toBeDefined()
    await browseButton?.trigger('click')
    await flushPromises()

    const pathInput = wrapper.find('input[placeholder="Path to executable"]')
    expect(pathInput.exists()).toBe(true)
    expect((pathInput.element as HTMLInputElement).value).toBe('/tools/steamcmd.sh')

    const saveButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Save Advanced Options'))
    expect(saveButton).toBeDefined()
    await saveButton?.trigger('click')
    await flushPromises()

    expect(workshop.pickSteamCmdExecutable).toHaveBeenCalledTimes(1)
    expect(workshop.saveAdvancedSettings).toHaveBeenCalledWith({
      webApiEnabled: false,
      webApiKey: undefined,
      steamCmdManualPath: '/tools/steamcmd.sh',
      timeouts: {
        loginTimeoutMs: 30_000,
        storedSessionTimeoutMs: 10_000,
        workshopTimeoutMs: 60_000
      }
    })
  })

  it('still saves a manual SteamCMD path when secure storage is unavailable', async () => {
    workshop.getAdvancedSettings.mockResolvedValueOnce({
      webApiEnabled: false,
      hasWebApiKey: false,
      secureStorageAvailable: false,
      steamCmdManualPath: undefined,
      steamCmdInstalled: true,
      steamCmdSource: 'auto',
      timeouts: {
        loginTimeoutMs: 30_000,
        storedSessionTimeoutMs: 10_000,
        workshopTimeoutMs: 60_000
      }
    })
    workshop.saveAdvancedSettings.mockResolvedValueOnce({
      webApiEnabled: false,
      hasWebApiKey: false,
      secureStorageAvailable: false,
      steamCmdManualPath: '/tools/steamcmd.sh',
      steamCmdInstalled: true,
      steamCmdSource: 'manual',
      timeouts: {
        loginTimeoutMs: 30_000,
        storedSessionTimeoutMs: 10_000,
        workshopTimeoutMs: 60_000
      }
    })

    const wrapper = mount(App)
    await flushPromises()

    const advancedToggle = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Advanced Developer Options'))
    expect(advancedToggle).toBeDefined()
    await advancedToggle?.trigger('click')
    await flushPromises()

    const browseButton = wrapper
      .findAll('button')
      .find((button) => button.text().trim() === 'Browse')
    expect(browseButton).toBeDefined()
    await browseButton?.trigger('click')
    await flushPromises()

    const saveButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Save Advanced Options'))
    expect(saveButton).toBeDefined()
    expect(saveButton?.attributes('disabled')).toBeUndefined()
    await saveButton?.trigger('click')
    await flushPromises()

    expect(workshop.saveAdvancedSettings).toHaveBeenCalledWith({
      webApiEnabled: false,
      webApiKey: undefined,
      steamCmdManualPath: '/tools/steamcmd.sh',
      timeouts: {
        loginTimeoutMs: 30_000,
        storedSessionTimeoutMs: 10_000,
        workshopTimeoutMs: 60_000
      }
    })
  })

  it('returns to mods when refresh removes the selected workshop item', async () => {
    const wrapper = mount(App)
    await flushPromises()

    const username = wrapper.find('input')
    const password = wrapper.find('input[type="password"]')
    await username.setValue('alice')
    await password.setValue('secret')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    await openUpdateTab(wrapper)

    workshop.getMyWorkshopItems.mockResolvedValueOnce([])

    const refreshButton = wrapper
      .findAll('button')
      .find((button) => button.text().trim() === 'Refresh')
    expect(refreshButton).toBeDefined()
    await refreshButton?.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('My Workshop Items')
    const updateTab = wrapper.findAll('button').find((button) => button.text().trim() === 'Update')
    expect(updateTab?.attributes('disabled')).toBeDefined()
  })

  it('shows success popup when visibility change succeeds', async () => {
    const wrapper = mount(App)
    await flushPromises()

    const username = wrapper.find('input')
    const password = wrapper.find('input[type="password"]')
    await username.setValue('alice')
    await password.setValue('secret')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    await openUpdateTab(wrapper)

    const hiddenVisibilityButton = wrapper
      .findAll('button')
      .find((button) => (button.attributes('title') ?? '').startsWith('Hidden:'))
    expect(hiddenVisibilityButton).toBeDefined()
    await hiddenVisibilityButton?.trigger('click')
    await flushPromises()

    const applyVisibilityButton = wrapper.findAll('button').find((button) => button.text().includes('Change to Hidden'))
    expect(applyVisibilityButton).toBeDefined()
    await applyVisibilityButton?.trigger('click')
    await flushPromises()

    expect(workshop.updateVisibility).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('Visibility Updated')
    expect(wrapper.text()).toContain('Changed to Hidden.')
    expect(wrapper.text()).not.toContain('"runId":"r3"')
  })

  it('shows upload success popup after creating an item', async () => {
    workshop.uploadMod.mockResolvedValueOnce({
      runId: 'r-upload-success',
      success: true,
      publishedFileId: '200'
    })

    const wrapper = mount(App)
    await flushPromises()

    const username = wrapper.find('input')
    const password = wrapper.find('input[type="password"]')
    await username.setValue('alice')
    await password.setValue('secret')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    const createTab = wrapper.findAll('button').find((button) => button.text().trim() === 'Create')
    expect(createTab).toBeDefined()
    await createTab?.trigger('click')
    await flushPromises()

    const pickContentFolderButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Choose Content Folder'))
    expect(pickContentFolderButton).toBeDefined()
    await pickContentFolderButton?.trigger('click')
    await flushPromises()

    const createButton = wrapper.findAll('button').find((button) => button.text().includes('Create New Item'))
    expect(createButton).toBeDefined()
    const publishArticle = createButton!.element.closest('article')
    expect(publishArticle).toBeTruthy()
    const publishInputs = publishArticle!.querySelectorAll('input')
    expect(publishInputs.length).toBeGreaterThanOrEqual(2)
    ;(publishInputs[0] as HTMLInputElement).value = '480'
    publishInputs[0].dispatchEvent(new Event('input', { bubbles: true }))
    ;(publishInputs[1] as HTMLInputElement).value = 'Created Mod'
    publishInputs[1].dispatchEvent(new Event('input', { bubbles: true }))
    const releaseNotesField = publishArticle!.querySelector('textarea')
    expect(releaseNotesField).toBeTruthy()
    ;(releaseNotesField as HTMLTextAreaElement).value = 'Initial release notes'
    releaseNotesField!.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()

    await createButton?.trigger('click')
    await flushPromises()

    const confirmCreateButton = wrapper
      .findAll('button')
      .find((button) => button.text().trim() === 'Create Item')
    expect(confirmCreateButton).toBeDefined()
    await confirmCreateButton?.trigger('click')
    await flushPromises()

    expect(workshop.uploadMod).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('Upload Completed')
    expect(wrapper.text()).toContain('Published File ID: 200')
  })

  it('shows upload failed popup and uses short status text', async () => {
    workshop.uploadMod.mockRejectedValueOnce(new Error('[command_failed] ERROR (No Connection)'))

    const wrapper = mount(App)
    await flushPromises()

    const username = wrapper.find('input')
    const password = wrapper.find('input[type="password"]')
    await username.setValue('alice')
    await password.setValue('secret')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    const createTab = wrapper.findAll('button').find((button) => button.text().trim() === 'Create')
    expect(createTab).toBeDefined()
    await createTab?.trigger('click')
    await flushPromises()

    const pickContentFolderButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Choose Content Folder'))
    expect(pickContentFolderButton).toBeDefined()
    await pickContentFolderButton?.trigger('click')
    await flushPromises()

    const createButton = wrapper.findAll('button').find((button) => button.text().includes('Create New Item'))
    expect(createButton).toBeDefined()
    const publishArticle = createButton!.element.closest('article')
    expect(publishArticle).toBeTruthy()
    const publishInputs = publishArticle!.querySelectorAll('input')
    expect(publishInputs.length).toBeGreaterThanOrEqual(2)
    ;(publishInputs[0] as HTMLInputElement).value = '480'
    publishInputs[0].dispatchEvent(new Event('input', { bubbles: true }))
    ;(publishInputs[1] as HTMLInputElement).value = 'Created Mod'
    publishInputs[1].dispatchEvent(new Event('input', { bubbles: true }))
    const releaseNotesField = publishArticle!.querySelector('textarea')
    expect(releaseNotesField).toBeTruthy()
    ;(releaseNotesField as HTMLTextAreaElement).value = 'Initial release notes'
    releaseNotesField!.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()

    await createButton?.trigger('click')
    await flushPromises()

    const confirmCreateButton = wrapper
      .findAll('button')
      .find((button) => button.text().trim() === 'Create Item')
    expect(confirmCreateButton).toBeDefined()
    await confirmCreateButton?.trigger('click')
    await flushPromises()

    expect(workshop.uploadMod).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('Upload Failed')
    expect(wrapper.text()).toContain('ERROR (No Connection)')
    expect((wrapper.vm as unknown as { statusMessage: string }).statusMessage).toBe('Upload failed. See popup.')
  })

  it('keeps create release notes disabled until content folder is selected', async () => {
    const wrapper = mount(App)
    await flushPromises()

    const username = wrapper.find('input')
    const password = wrapper.find('input[type="password"]')
    await username.setValue('alice')
    await password.setValue('secret')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    const createTab = wrapper.findAll('button').find((button) => button.text().trim() === 'Create')
    expect(createTab).toBeDefined()
    await createTab?.trigger('click')
    await flushPromises()

    const releaseNotesField = wrapper.find('textarea')
    expect(releaseNotesField.exists()).toBe(true)
    expect(releaseNotesField.attributes('disabled')).toBeDefined()

    const pickContentFolderButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Choose Content Folder'))
    expect(pickContentFolderButton).toBeDefined()
    await pickContentFolderButton?.trigger('click')
    await flushPromises()

    expect(releaseNotesField.attributes('disabled')).toBeUndefined()
  })

  it('includes selected create visibility in upload payload', async () => {
    const wrapper = mount(App)
    await flushPromises()

    const username = wrapper.find('input')
    const password = wrapper.find('input[type="password"]')
    await username.setValue('alice')
    await password.setValue('secret')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    const createTab = wrapper.findAll('button').find((button) => button.text().trim() === 'Create')
    expect(createTab).toBeDefined()
    await createTab?.trigger('click')
    await flushPromises()

    const pickContentFolderButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Choose Content Folder'))
    expect(pickContentFolderButton).toBeDefined()
    await pickContentFolderButton?.trigger('click')
    await flushPromises()

    const createButton = wrapper.findAll('button').find((button) => button.text().includes('Create New Item'))
    expect(createButton).toBeDefined()
    const publishArticle = createButton!.element.closest('article')
    expect(publishArticle).toBeTruthy()
    const publishInputs = publishArticle!.querySelectorAll('input')
    expect(publishInputs.length).toBeGreaterThanOrEqual(2)
    ;(publishInputs[0] as HTMLInputElement).value = '480'
    publishInputs[0].dispatchEvent(new Event('input', { bubbles: true }))
    ;(publishInputs[1] as HTMLInputElement).value = 'Created With Hidden Visibility'
    publishInputs[1].dispatchEvent(new Event('input', { bubbles: true }))

    const visibilitySelect = publishArticle!.querySelector('select')
    expect(visibilitySelect).toBeTruthy()
    ;(visibilitySelect as HTMLSelectElement).value = '2'
    visibilitySelect!.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    await createButton?.trigger('click')
    await flushPromises()

    const confirmCreateButton = wrapper
      .findAll('button')
      .find((button) => button.text().trim() === 'Create Item')
    expect(confirmCreateButton).toBeDefined()
    await confirmCreateButton?.trigger('click')
    await flushPromises()

    expect(workshop.uploadMod).toHaveBeenCalledTimes(1)
    expect(workshop.uploadMod).toHaveBeenCalledWith({
      draft: expect.objectContaining({
        appId: '480',
        title: 'Created With Hidden Visibility',
        visibility: 2
      })
    })
  })

  it('opens create confirmation modal and cancel does not upload', async () => {
    const wrapper = mount(App)
    await flushPromises()

    const username = wrapper.find('input')
    const password = wrapper.find('input[type="password"]')
    await username.setValue('alice')
    await password.setValue('secret')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    const createTab = wrapper.findAll('button').find((button) => button.text().trim() === 'Create')
    expect(createTab).toBeDefined()
    await createTab?.trigger('click')
    await flushPromises()

    const pickContentFolderButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Choose Content Folder'))
    expect(pickContentFolderButton).toBeDefined()
    await pickContentFolderButton?.trigger('click')
    await flushPromises()

    const createButton = wrapper.findAll('button').find((button) => button.text().includes('Create New Item'))
    expect(createButton).toBeDefined()
    const publishArticle = createButton!.element.closest('article')
    expect(publishArticle).toBeTruthy()
    const publishInputs = publishArticle!.querySelectorAll('input')
    expect(publishInputs.length).toBeGreaterThanOrEqual(2)
    ;(publishInputs[0] as HTMLInputElement).value = '480'
    publishInputs[0].dispatchEvent(new Event('input', { bubbles: true }))
    ;(publishInputs[1] as HTMLInputElement).value = 'Created But Cancelled'
    publishInputs[1].dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()

    await createButton?.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Create Workshop Item?')

    const cancelCreateButton = wrapper
      .findAll('button')
      .find((button) => button.text().trim() === 'Cancel')
    expect(cancelCreateButton).toBeDefined()
    await cancelCreateButton?.trigger('click')
    await flushPromises()

    expect(workshop.uploadMod).not.toHaveBeenCalled()
  })

  it('shows update failed popup and uses short status text', async () => {
    workshop.updateMod.mockRejectedValueOnce(
      new Error('[command_failed] Steam connection failed after 4 retries. Check internet/Steam status and retry.')
    )

    const wrapper = mount(App)
    await flushPromises()

    const username = wrapper.find('input')
    const password = wrapper.find('input[type="password"]')
    await username.setValue('alice')
    await password.setValue('secret')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    await openUpdateTab(wrapper)

    const pickContentFolderButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Choose Content Folder'))
    expect(pickContentFolderButton).toBeDefined()
    await pickContentFolderButton?.trigger('click')
    await flushPromises()

    const updateButton = findPrimaryActionButton(wrapper, 'Update Item')
    expect(updateButton).toBeDefined()
    await updateButton?.trigger('click')
    await flushPromises()

    const confirmUpdateButton = findConfirmUpdateButton(wrapper)
    expect(confirmUpdateButton).toBeDefined()
    await confirmUpdateButton?.trigger('click')
    await flushPromises()

    expect(workshop.updateMod).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('Update Failed')
    expect(wrapper.text()).toContain('Steam connection failed after 4 retries')
    expect((wrapper.vm as unknown as { statusMessage: string }).statusMessage).toBe('Update failed. See popup.')
  })

  it('allows update when only preview image is set (no content folder)', async () => {
    const wrapper = mount(App)
    await flushPromises()

    const username = wrapper.find('input')
    const password = wrapper.find('input[type="password"]')
    await username.setValue('alice')
    await password.setValue('secret')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    await openUpdateTab(wrapper)

    const updateButton = findPrimaryActionButton(wrapper, 'Update Item')
    expect(updateButton).toBeDefined()
    expect(updateButton?.attributes('disabled')).toBeDefined()

    const pickPreviewButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Click to choose an image'))
    expect(pickPreviewButton).toBeDefined()
    await pickPreviewButton?.trigger('click')
    await flushPromises()

    expect(updateButton?.attributes('disabled')).toBeUndefined()
    await updateButton?.trigger('click')
    await flushPromises()

    const confirmUpdateButton = findConfirmUpdateButton(wrapper)
    expect(confirmUpdateButton).toBeDefined()
    await confirmUpdateButton?.trigger('click')
    await flushPromises()

    expect(workshop.updateMod).toHaveBeenCalledTimes(1)
    expect(workshop.updateMod).toHaveBeenCalledWith({
      draft: expect.objectContaining({
        appId: '480',
        publishedFileId: '123',
        contentFolder: '',
        previewFile: '/mods/preview.png',
        title: 'Test Item'
      })
    })
    expect(wrapper.text()).toContain('Update Completed')
    expect(wrapper.text()).toContain('Workshop item update finished successfully.')
  })

  it('allows update when content folder is selected (preview not required)', async () => {
    const wrapper = mount(App)
    await flushPromises()

    const username = wrapper.find('input')
    const password = wrapper.find('input[type="password"]')
    await username.setValue('alice')
    await password.setValue('secret')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    await openUpdateTab(wrapper)

    const updateButton = findPrimaryActionButton(wrapper, 'Update Item')
    expect(updateButton).toBeDefined()
    expect(updateButton?.attributes('disabled')).toBeDefined()

    const pickContentFolderButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Choose Content Folder'))
    expect(pickContentFolderButton).toBeDefined()
    await pickContentFolderButton?.trigger('click')
    await flushPromises()

    expect(updateButton?.attributes('disabled')).toBeUndefined()
  })

  it('keeps title-only update disabled when title changes only by case/spacing', async () => {
    const wrapper = mount(App)
    await flushPromises()

    const username = wrapper.find('input')
    const password = wrapper.find('input[type="password"]')
    await username.setValue('alice')
    await password.setValue('secret')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    await openUpdateTab(wrapper)

    const titleInput = wrapper
      .findAll('input')
      .find((input) => (input.element as HTMLInputElement).value === 'Test Item')
    expect(titleInput).toBeDefined()
    await titleInput?.setValue('   test    item   ')
    await flushPromises()

    const updateButton = findPrimaryActionButton(wrapper, 'Update Item')
    expect(updateButton).toBeDefined()
    expect(updateButton?.attributes('disabled')).toBeDefined()
  })

  it('disables update again after selecting and then resetting content folder', async () => {
    const wrapper = mount(App)
    await flushPromises()

    const username = wrapper.find('input')
    const password = wrapper.find('input[type="password"]')
    await username.setValue('alice')
    await password.setValue('secret')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    await openUpdateTab(wrapper)

    const updateButton = findPrimaryActionButton(wrapper, 'Update Item')
    expect(updateButton).toBeDefined()
    expect(updateButton?.attributes('disabled')).toBeDefined()

    const pickContentFolderButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Choose Content Folder'))
    expect(pickContentFolderButton).toBeDefined()
    await pickContentFolderButton?.trigger('click')
    await flushPromises()
    expect(updateButton?.attributes('disabled')).toBeUndefined()

    const resetFolderButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Reset Folder'))
    expect(resetFolderButton).toBeDefined()
    await resetFolderButton?.trigger('click')
    await flushPromises()

    expect(updateButton?.attributes('disabled')).toBeDefined()
  })

  it('allows title-only update with no content folder or preview image', async () => {
    const wrapper = mount(App)
    await flushPromises()

    const username = wrapper.find('input')
    const password = wrapper.find('input[type="password"]')
    await username.setValue('alice')
    await password.setValue('secret')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    await openUpdateTab(wrapper)

    const titleInput = wrapper
      .findAll('input')
      .find((input) => (input.element as HTMLInputElement).value === 'Test Item')
    expect(titleInput).toBeDefined()
    await titleInput?.setValue('Renamed Test Item')
    await flushPromises()

    const updateButton = findPrimaryActionButton(wrapper, 'Update Item')
    expect(updateButton).toBeDefined()
    expect(updateButton?.attributes('disabled')).toBeUndefined()
    await updateButton?.trigger('click')
    await flushPromises()

    const confirmUpdateButton = findConfirmUpdateButton(wrapper)
    expect(confirmUpdateButton).toBeDefined()
    await confirmUpdateButton?.trigger('click')
    await flushPromises()

    expect(workshop.updateMod).toHaveBeenCalledTimes(1)
    expect(workshop.updateMod).toHaveBeenCalledWith({
      draft: expect.objectContaining({
        appId: '480',
        publishedFileId: '123',
        contentFolder: '',
        previewFile: '',
        title: 'Renamed Test Item'
      })
    })
  })

  it('shows concise update popup when selected content folder is empty', async () => {
    workshop.updateMod.mockRejectedValueOnce(
      new Error('[validation] Selected content folder is empty. Add files or use preview-only update.')
    )

    const wrapper = mount(App)
    await flushPromises()

    const username = wrapper.find('input')
    const password = wrapper.find('input[type="password"]')
    await username.setValue('alice')
    await password.setValue('secret')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    await openUpdateTab(wrapper)

    const pickContentFolderButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Choose Content Folder'))
    expect(pickContentFolderButton).toBeDefined()
    await pickContentFolderButton?.trigger('click')
    await flushPromises()

    const updateButton = findPrimaryActionButton(wrapper, 'Update Item')
    expect(updateButton).toBeDefined()
    await updateButton?.trigger('click')
    await flushPromises()

    const confirmUpdateButton = findConfirmUpdateButton(wrapper)
    expect(confirmUpdateButton).toBeDefined()
    await confirmUpdateButton?.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Update Failed')
    expect(wrapper.text()).toContain('Selected content folder is empty')
    expect((wrapper.vm as unknown as { statusMessage: string }).statusMessage).toBe('Update failed. See popup.')
  })

  it('auto-loads mod content files after selecting a content folder', async () => {
    workshop.listContentFolderFiles.mockResolvedValueOnce([
      {
        absolutePath: '/mods/readme.txt',
        relativePath: 'readme.txt',
        sizeBytes: 6
      },
      {
        absolutePath: '/mods/data/config.json',
        relativePath: 'data/config.json',
        sizeBytes: 18
      }
    ])

    const wrapper = mount(App)
    await flushPromises()

    const username = wrapper.find('input')
    const password = wrapper.find('input[type="password"]')
    await username.setValue('alice')
    await password.setValue('secret')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    await openUpdateTab(wrapper)

    const pickContentFolderButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Choose Content Folder'))
    expect(pickContentFolderButton).toBeDefined()
    await pickContentFolderButton?.trigger('click')
    await flushPromises()

    expect(workshop.listContentFolderFiles).toHaveBeenCalledWith({ folderPath: '/mods' })
    expect(wrapper.text()).toContain('Content Explorer')
    expect(wrapper.text()).toContain('readme.txt')
    expect(wrapper.text()).toContain('config.json')
    expect(wrapper.text()).toContain('24 B')
    expect(wrapper.text()).not.toContain('Drag and drop files to add mod content')
    expect(wrapper.text()).not.toContain('data/config.json')
  })

  it('clears content folder and staged files from mod content panel', async () => {
    workshop.listContentFolderFiles.mockResolvedValueOnce([
      {
        absolutePath: '/mods/readme.txt',
        relativePath: 'readme.txt',
        sizeBytes: 6
      }
    ])

    const wrapper = mount(App)
    await flushPromises()

    const username = wrapper.find('input')
    const password = wrapper.find('input[type="password"]')
    await username.setValue('alice')
    await password.setValue('secret')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    await openUpdateTab(wrapper)

    const pickContentFolderButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Choose Content Folder'))
    expect(pickContentFolderButton).toBeDefined()
    await pickContentFolderButton?.trigger('click')
    await flushPromises()

    const clearContentFolderButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Reset Folder'))
    expect(clearContentFolderButton).toBeDefined()
    await clearContentFolderButton?.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('No files found in selected content folder.')
  })

  it('shows error popup when visibility change fails', async () => {
    workshop.updateVisibility.mockRejectedValueOnce(new Error('[command_failed] upstream failed'))

    const wrapper = mount(App)
    await flushPromises()

    const username = wrapper.find('input')
    const password = wrapper.find('input[type="password"]')
    await username.setValue('alice')
    await password.setValue('secret')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    await openUpdateTab(wrapper)

    const hiddenVisibilityButton = wrapper
      .findAll('button')
      .find((button) => (button.attributes('title') ?? '').startsWith('Hidden:'))
    expect(hiddenVisibilityButton).toBeDefined()
    await hiddenVisibilityButton?.trigger('click')
    await flushPromises()

    const applyVisibilityButton = wrapper.findAll('button').find((button) => button.text().includes('Change to Hidden'))
    expect(applyVisibilityButton).toBeDefined()
    await applyVisibilityButton?.trigger('click')
    await flushPromises()

    expect(workshop.updateVisibility).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('Visibility Update Failed')
    expect(wrapper.text()).toContain('upstream failed')
    expect((wrapper.vm as unknown as { statusMessage: string }).statusMessage).toBe('Visibility update failed. See popup.')
  })
})
