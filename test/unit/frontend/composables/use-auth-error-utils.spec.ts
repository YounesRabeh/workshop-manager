/** @vitest-environment jsdom */

import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useAuthErrorUtils } from '@frontend/composables/useAuthErrorUtils'

describe('useAuthErrorUtils', () => {
  it('normalizes coded errors and maps credential failures to a danger auth issue', () => {
    const statusMessage = ref('')
    const authIssue = ref(null)
    const utils = useAuthErrorUtils({
      statusMessage,
      authIssue
    })

    const parsed = utils.normalizeError(new Error('[auth] username or password is incorrect'))

    expect(parsed).toEqual({
      code: 'auth',
      message: 'username or password is incorrect'
    })

    expect(utils.toAuthIssue(parsed)).toEqual({
      title: 'Wrong Credentials',
      detail: 'Wrong username or password. Try again.',
      hint: 'Check account name and password, then sign in again.',
      tone: 'danger'
    })
  })

  it('maps steam guard timeout errors to warning auth issue copy', () => {
    const utils = useAuthErrorUtils({
      statusMessage: ref(''),
      authIssue: ref(null)
    })

    const issue = utils.toAuthIssue({
      code: 'steam_guard',
      message: 'Steam mobile confirmation timed out.'
    })

    expect(issue.title).toBe('Steam Guard Confirmation Timed Out')
    expect(issue.tone).toBe('warning')
  })

  it('opens missing-steamcmd status flow and clears stale auth issue', () => {
    const onSteamCmdPathRequired = vi.fn()
    const statusMessage = ref('')
    const authIssue = ref({
      title: 'Old Error',
      detail: 'stale',
      tone: 'danger' as const
    })

    const utils = useAuthErrorUtils({
      statusMessage,
      authIssue,
      onSteamCmdPathRequired
    })

    const handled = utils.handleSteamCmdMissingStatus('SteamCMD executable path is not configured')

    expect(handled).toBe(true)
    expect(onSteamCmdPathRequired).toHaveBeenCalledTimes(1)
    expect(statusMessage.value).toBe('SteamCMD not found. Advanced options opened. Add the SteamCMD executable path.')
    expect(authIssue.value).toBeNull()
  })
})
