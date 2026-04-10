/** @vitest-environment jsdom */

import { describe, expect, it, vi, beforeEach } from 'vitest'
import { useStoredSessionManagement } from '@frontend/composables/useStoredSessionManagement'

describe('useStoredSessionManagement composable', () => {
  const workshop = {
    clearStoredSession: vi.fn(async () => ({ ok: true }))
  }

  beforeEach(() => {
    vi.clearAllMocks()
    ;(window as unknown as { workshop: typeof workshop }).workshop = workshop
  })

  it('hydrates remembered profile state into persisted/current flags', () => {
    const session = useStoredSessionManagement()
    session.applyRememberedProfileState(true)
    expect(session.hasPersistedStoredSession.value).toBe(true)
    expect(session.canUseStoredSessionForCurrentLogin.value).toBe(true)
  })

  it('disables current-login stored session without clearing persisted marker', () => {
    const session = useStoredSessionManagement()
    session.applyRememberedProfileState(true)
    session.disableStoredSessionForCurrentLogin()
    expect(session.hasPersistedStoredSession.value).toBe(true)
    expect(session.canUseStoredSessionForCurrentLogin.value).toBe(false)
  })

  it('clears backend stored session and resets both flags', async () => {
    const session = useStoredSessionManagement()
    session.applyRememberedProfileState(true)
    await session.clearStoredSession()
    expect(workshop.clearStoredSession).toHaveBeenCalledTimes(1)
    expect(session.hasPersistedStoredSession.value).toBe(false)
    expect(session.canUseStoredSessionForCurrentLogin.value).toBe(false)
  })
})
