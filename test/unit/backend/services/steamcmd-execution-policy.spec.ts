import { describe, expect, it } from 'vitest'
import { resolveSteamCmdExecutionPolicy } from '@backend/services/steamcmd-execution-policy'

describe('steamcmd execution policy', () => {
  it('defaults to interactive mode with credential scripts disabled', () => {
    const policy = resolveSteamCmdExecutionPolicy({})
    expect(policy).toEqual({
      mode: 'interactive',
      allowCredentialScripts: false
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

  it('parses truthy credential script flags', () => {
    const policy = resolveSteamCmdExecutionPolicy({
      STEAMCMD_ALLOW_CREDENTIAL_SCRIPTS: 'true'
    })
    expect(policy.allowCredentialScripts).toBe(true)
  })
})

