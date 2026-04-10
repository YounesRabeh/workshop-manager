/** @vitest-environment jsdom */

import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import LoginSection from '@frontend/components/LoginSection.vue'
import type { AdvancedSettingsState, LoginFormState } from '@frontend/types/ui'

function createAdvancedSettings(overrides: Partial<AdvancedSettingsState> = {}): AdvancedSettingsState {
  return {
    webApiEnabled: false,
    webApiKey: '',
    hasWebApiKey: false,
    secureStorageAvailable: true,
    steamCmdManualPath: '',
    steamCmdInstalled: true,
    steamCmdSource: 'auto',
    loginTimeoutMs: '30',
    storedSessionTimeoutMs: '10',
    workshopTimeoutMs: '60',
    isSaving: false,
    statusMessage: '',
    ...overrides
  }
}

function createLoginForm(overrides: Partial<LoginFormState> = {}): LoginFormState {
  return {
    username: 'alice',
    password: 'secret',
    rememberUsername: true,
    rememberAuth: false,
    ...overrides
  }
}

function mountLoginSection(
  overrides: Partial<InstanceType<typeof LoginSection>['$props']> = {},
  options?: { attachTo?: Element }
) {
  return mount(LoginSection, {
    props: {
      statusMessage: 'SteamCMD found',
      appVersion: '1.2.3',
      isLoginSubmitting: false,
      loginForm: createLoginForm(),
      isPasswordPeek: false,
      authIssue: null,
      steamGuardPromptType: 'none',
      preferredAuthMode: 'otp',
      activeChallengeMode: 'none',
      steamGuardCode: '',
      isStoredSessionLoginAttempt: false,
      canClearStoredSession: false,
      canUseStoredSessionForLogin: false,
      isAdvancedOptionsOpen: false,
      advancedSettings: createAdvancedSettings(),
      isWebApiKeyPeek: false,
      installLogPath: '',
      timeoutScope: 'login_only',
      ...overrides
    },
    ...(options ?? {})
  })
}

describe('LoginSection component', () => {
  it('renders the security mode selector and emits preference changes', async () => {
    const wrapper = mountLoginSection()

    const mobileRadio = wrapper.find('input[type="radio"][value="steam_guard_mobile"]')
    expect(mobileRadio.exists()).toBe(true)

    await mobileRadio.setValue(true)
    expect(wrapper.emitted('update-preferred-auth-mode')?.at(-1)).toEqual(['steam_guard_mobile'])
  })

  it('shows OTP entry and emits submit event when code challenge is active', async () => {
    const wrapper = mountLoginSection({
      steamGuardPromptType: 'steam_guard_code',
      activeChallengeMode: 'otp',
      steamGuardCode: '12345'
    })

    expect(wrapper.text()).toContain('OTP / Email code required')

    const otpSubmitButton = wrapper
      .findAll('button')
      .find((button) => button.text().trim() === 'Submit OTP / Email code')
    expect(otpSubmitButton).toBeDefined()

    await otpSubmitButton?.trigger('click')
    expect(wrapper.emitted('submit-guard-code')?.length ?? 0).toBeGreaterThan(0)
  })

  it('emits session control changes and clear-session action', async () => {
    const wrapper = mountLoginSection({
      loginForm: createLoginForm({ rememberAuth: true }),
      canClearStoredSession: true
    })

    const rememberAuth = wrapper.find('input[data-login-control="remember-auth"]')
    expect(rememberAuth.exists()).toBe(true)

    await rememberAuth.setValue(false)
    expect(wrapper.emitted('update-remember-auth')?.at(-1)).toEqual([false])

    const clearSessionButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Clear saved session'))
    expect(clearSessionButton).toBeDefined()

    await clearSessionButton?.trigger('click')
    expect(wrapper.emitted('clear-stored-session')?.length ?? 0).toBeGreaterThan(0)
  })

  it('moves focus with vertical arrows across login controls', async () => {
    const wrapper = mountLoginSection(
      {
        loginForm: createLoginForm({
          username: 'alice',
          password: ''
        }),
        canUseStoredSessionForLogin: true
      },
      { attachTo: document.body }
    )
    try {
      await nextTick()

      const username = wrapper.find('input[data-login-control="username"]').element as HTMLInputElement
      const password = wrapper.find('input[data-login-control="password"]').element as HTMLInputElement
      const rememberUsername = wrapper.find('input[data-login-control="remember-username"]').element as HTMLInputElement
      const rememberAuth = wrapper.find('input[data-login-control="remember-auth"]').element as HTMLInputElement
      const submit = wrapper.find('button[data-login-control="submit"]').element as HTMLButtonElement

      username.focus()
      expect(document.activeElement).toBe(username)

      await wrapper.find('input[data-login-control="username"]').trigger('keydown', { key: 'ArrowDown' })
      await nextTick()
      expect(document.activeElement).toBe(password)

      await wrapper.find('input[data-login-control="password"]').trigger('keydown', { key: 'ArrowDown' })
      await nextTick()
      expect(document.activeElement).toBe(rememberUsername)

      await wrapper.find('input[data-login-control="remember-username"]').trigger('keydown', { key: 'ArrowDown' })
      await nextTick()
      expect(document.activeElement).toBe(rememberAuth)

      await wrapper.find('input[data-login-control="remember-auth"]').trigger('keydown', { key: 'ArrowDown' })
      await nextTick()
      expect(document.activeElement).toBe(submit)
    } finally {
      wrapper.unmount()
    }
  })
})
