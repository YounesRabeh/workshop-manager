import { describe, expect, it } from 'vitest'
import { resolveSteamCmdExecutionPolicy } from '@backend/services/steamcmd/execution-policy'

describe('steamcmd execution policy', () => {
  it('defaults standalone callers to interactive mode', () => {
    const policy = resolveSteamCmdExecutionPolicy({})
    expect(policy).toEqual({
      mode: 'interactive'
    })
  })

  it('enables script mode when explicitly requested', () => {
    const policy = resolveSteamCmdExecutionPolicy({
      STEAMCMD_EXECUTION_MODE: 'script'
    })
    expect(policy.mode).toBe('script')
  })

  it('falls back to interactive mode for unknown mode values', () => {
    const policy = resolveSteamCmdExecutionPolicy({
      STEAMCMD_EXECUTION_MODE: 'unsupported'
    })
    expect(policy.mode).toBe('interactive')
  })

})
