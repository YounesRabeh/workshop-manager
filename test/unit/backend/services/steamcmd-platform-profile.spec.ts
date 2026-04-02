import { describe, expect, it } from 'vitest'
import {
  getSteamCmdPlatformBehavior,
  resolveSteamCmdPlatformProfile
} from '@backend/services/steamcmd-platform-profile'

describe('steamcmd platform profile', () => {
  it('maps supported runtime platforms to internal SteamCMD profiles', () => {
    expect(resolveSteamCmdPlatformProfile('linux')).toBe('linux')
    expect(resolveSteamCmdPlatformProfile('win32')).toBe('windows')
  })

  it('rejects unsupported runtime platforms', () => {
    expect(() => resolveSteamCmdPlatformProfile('darwin')).toThrow(
      'Unsupported SteamCMD platform profile for runtime platform: darwin'
    )
  })

  it('exposes the expected Linux and Windows SteamCMD behaviors', () => {
    expect(getSteamCmdPlatformBehavior('linux')).toMatchObject({
      expectedExecutableName: 'steamcmd.sh',
      archiveKind: 'tar.gz',
      loginExecution: 'interactive',
      identityResolution: 'steamcmd_output'
    })

    expect(getSteamCmdPlatformBehavior('windows')).toMatchObject({
      expectedExecutableName: 'steamcmd.exe',
      archiveKind: 'zip',
      useShellHost: false,
      loginExecution: 'one_shot',
      workshopExecution: 'one_shot',
      persistentSessionStartup: 'none',
      identityResolution: 'steamcmd_output_then_custom_profile'
    })
  })
})
