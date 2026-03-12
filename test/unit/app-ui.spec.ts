/** @vitest-environment jsdom */

import { describe, expect, it, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import App from '../../src/frontend/App.vue'

const workshop = {
  ensureSteamCmdInstalled: vi.fn(async () => ({ installed: true })),
  login: vi.fn(async () => ({ sessionId: 's1' })),
  logout: vi.fn(async () => ({ ok: true })),
  submitSteamGuardCode: vi.fn(async () => ({ ok: true })),
  uploadMod: vi.fn(async () => ({ runId: 'r1', success: true })),
  updateMod: vi.fn(async () => ({ runId: 'r2', success: true })),
  updateVisibility: vi.fn(async () => ({ runId: 'r3', success: true })),
  getProfiles: vi.fn(async () => ({ profiles: [], rememberedUsername: 'alice', rememberAuth: false })),
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
  saveProfile: vi.fn(async ({ profile }) => profile),
  deleteProfile: vi.fn(async () => ({ ok: true })),
  getRunLogs: vi.fn(async () => []),
  getRunLog: vi.fn(async () => null),
  pickFolder: vi.fn(async () => '/mods'),
  pickFile: vi.fn(async () => '/mods/preview.png'),
  onRunEvent: vi.fn(() => () => undefined)
}

describe('App UI validation gates', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(window as unknown as { workshop: typeof workshop }).workshop = workshop
  })

  it('disables update/create actions until required fields are present', async () => {
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

    const updateButton = wrapper.findAll('button').find((button) => button.text().includes('Update Existing Item'))
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
  })
})
