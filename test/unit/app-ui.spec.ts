/** @vitest-environment jsdom */

import { describe, expect, it, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import App from '../../src/frontend/App.vue'

const workshop = {
  ensureSteamCmdInstalled: vi.fn(async () => ({ installed: true })),
  getAppVersion: vi.fn(async () => ({ version: '0.1.0' })),
  login: vi.fn(async () => ({ sessionId: 's1' })),
  quitApp: vi.fn(async () => ({ ok: true })),
  logout: vi.fn(async () => ({ ok: true })),
  clearStoredSession: vi.fn(async () => ({ ok: true })),
  submitSteamGuardCode: vi.fn(async () => ({ ok: true })),
  uploadMod: vi.fn(async () => ({ runId: 'r1', success: true })),
  updateMod: vi.fn(async () => ({ runId: 'r2', success: true })),
  updateVisibility: vi.fn(async () => ({ runId: 'r3', success: true })),
  getProfiles: vi.fn(async () => ({ profiles: [], rememberedUsername: 'alice', rememberAuth: false, hasStoredAuth: false })),
  getAdvancedSettings: vi.fn(async () => ({
    webApiEnabled: false,
    hasWebApiKey: false,
    secureStorageAvailable: true
  })),
  saveAdvancedSettings: vi.fn(async (payload: { webApiEnabled: boolean; webApiKey?: string; clearWebApiKey?: boolean }) => ({
    webApiEnabled: payload.webApiEnabled,
    hasWebApiKey: Boolean(payload.webApiKey && payload.webApiKey.trim().length > 0 && !payload.clearWebApiKey),
    secureStorageAvailable: true
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
  getRunLogs: vi.fn(async () => []),
  getRunLog: vi.fn(async () => null),
  pickFolder: vi.fn(async () => '/mods'),
  pickFile: vi.fn(async () => '/mods/preview.png'),
  onRunEvent: vi.fn(() => () => undefined)
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

    const modButton = wrapper.findAll('button').find((button) => button.text().includes('Test Item'))
    expect(modButton).toBeDefined()
    await modButton?.trigger('click')
    await flushPromises()

    const updateButton = findPrimaryActionButton(wrapper, 'Update Item')
    expect(updateButton?.attributes('disabled')).toBeDefined()

    const createTab = wrapper.findAll('button').find((button) => button.text().trim() === 'Create')
    expect(createTab).toBeDefined()
    await createTab?.trigger('click')
    await flushPromises()

    const createButton = wrapper.findAll('button').find((button) => button.text().includes('Create New Item'))
    expect(createButton?.attributes('disabled')).toBeDefined()
  })

  it('hydrates remembered username without persisting password', async () => {
    const wrapper = mount(App)
    await flushPromises()

    const usernameInput = wrapper.find('input')
    const passwordInput = wrapper.find('input[type="password"]')

    expect((usernameInput.element as HTMLInputElement).value).toBe('alice')
    expect((passwordInput.element as HTMLInputElement).value).toBe('')
  })

  it('clears saved session from login panel', async () => {
    workshop.getProfiles.mockResolvedValueOnce({
      profiles: [],
      rememberedUsername: 'alice',
      rememberAuth: true,
      hasStoredAuth: true
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
      hasStoredAuth: true
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

    const avatar = wrapper.find('.session-avatar')
    expect(avatar.exists()).toBe(true)
    expect(avatar.attributes('src')).toContain('https://example.invalid/avatar.png')
  })

  it('saves advanced web api settings from login panel', async () => {
    const wrapper = mount(App)
    await flushPromises()

    const advancedToggle = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Advanced Developer Options'))
    expect(advancedToggle).toBeDefined()
    await advancedToggle?.trigger('click')
    await flushPromises()

    const apiKeyInput = wrapper.find('input[placeholder="Paste key..."]')
    expect(apiKeyInput.exists()).toBe(true)
    await apiKeyInput.setValue('dev-key-123')

    const saveButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Save Advanced Options'))
    expect(saveButton).toBeDefined()
    await saveButton?.trigger('click')
    await flushPromises()

    expect(workshop.saveAdvancedSettings).toHaveBeenCalledWith({
      webApiEnabled: true,
      webApiKey: 'dev-key-123'
    })
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
      webApiKey: undefined
    })
  })

  it('clears saved web api key from advanced settings', async () => {
    workshop.getAdvancedSettings.mockResolvedValueOnce({
      webApiEnabled: true,
      hasWebApiKey: true,
      secureStorageAvailable: true
    })

    const wrapper = mount(App)
    await flushPromises()

    const advancedToggle = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Advanced Developer Options'))
    expect(advancedToggle).toBeDefined()
    await advancedToggle?.trigger('click')
    await flushPromises()

    const clearButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Clear Saved Key'))
    expect(clearButton).toBeDefined()
    await clearButton?.trigger('click')
    await flushPromises()

    expect(workshop.saveAdvancedSettings).toHaveBeenCalledWith({
      webApiEnabled: true,
      clearWebApiKey: true
    })
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

    const modButton = wrapper.findAll('button').find((button) => button.text().includes('Test Item'))
    expect(modButton).toBeDefined()
    await modButton?.trigger('click')
    await flushPromises()

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
    await flushPromises()

    await createButton?.trigger('click')
    await flushPromises()

    expect(workshop.uploadMod).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('Upload Failed')
    expect(wrapper.text()).toContain('ERROR (No Connection)')
    expect((wrapper.vm as unknown as { statusMessage: string }).statusMessage).toBe('Upload failed. See popup.')
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

    const modButton = wrapper.findAll('button').find((button) => button.text().includes('Test Item'))
    expect(modButton).toBeDefined()
    await modButton?.trigger('click')
    await flushPromises()

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

    const modButton = wrapper.findAll('button').find((button) => button.text().includes('Test Item'))
    expect(modButton).toBeDefined()
    await modButton?.trigger('click')
    await flushPromises()

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
      profileId: '123',
      draft: expect.objectContaining({
        appId: '480',
        publishedFileId: '123',
        contentFolder: '',
        previewFile: '/mods/preview.png',
        title: 'Test Item'
      })
    })
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

    const modButton = wrapper.findAll('button').find((button) => button.text().includes('Test Item'))
    expect(modButton).toBeDefined()
    await modButton?.trigger('click')
    await flushPromises()

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

    const modButton = wrapper.findAll('button').find((button) => button.text().includes('Test Item'))
    expect(modButton).toBeDefined()
    await modButton?.trigger('click')
    await flushPromises()

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

    const modButton = wrapper.findAll('button').find((button) => button.text().includes('Test Item'))
    expect(modButton).toBeDefined()
    await modButton?.trigger('click')
    await flushPromises()

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

    const modButton = wrapper.findAll('button').find((button) => button.text().includes('Test Item'))
    expect(modButton).toBeDefined()
    await modButton?.trigger('click')
    await flushPromises()

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
      profileId: '123',
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

    const modButton = wrapper.findAll('button').find((button) => button.text().includes('Test Item'))
    expect(modButton).toBeDefined()
    await modButton?.trigger('click')
    await flushPromises()

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

    const modButton = wrapper.findAll('button').find((button) => button.text().includes('Test Item'))
    expect(modButton).toBeDefined()
    await modButton?.trigger('click')
    await flushPromises()

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

    const modButton = wrapper.findAll('button').find((button) => button.text().includes('Test Item'))
    expect(modButton).toBeDefined()
    await modButton?.trigger('click')
    await flushPromises()

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

    const modButton = wrapper.findAll('button').find((button) => button.text().includes('Test Item'))
    expect(modButton).toBeDefined()
    await modButton?.trigger('click')
    await flushPromises()

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
