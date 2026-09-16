/**
 * Overview: Verifies the build-time SteamCMD launch flag behavior.
 * Responsibility: Guards enabled, disabled, immutable, and duplicate-flag launch argument handling.
 */
import { describe, expect, it } from 'vitest'
import { BUILD_FLAGS, buildSteamCmdLaunchArgs } from '@shared/build-config'

describe('buildSteamCmdLaunchArgs', () => {
  it('applies the configured IPv6 opt-out to SteamCMD launches', () => {
    expect(BUILD_FLAGS.steamCmdNoIpv6).toBe(true)
    expect(buildSteamCmdLaunchArgs(['+login', 'anonymous', '+quit'])).toEqual([
      '-noipv6',
      '+login',
      'anonymous',
      '+quit'
    ])
  })

  it('leaves launch arguments unchanged when the build flag is disabled', () => {
    expect(buildSteamCmdLaunchArgs(['+quit'], false)).toEqual(['+quit'])
  })

  it('does not mutate input or add the flag twice', () => {
    const input = ['-noipv6', '+quit']

    expect(buildSteamCmdLaunchArgs(input)).toEqual(input)
    expect(input).toEqual(['-noipv6', '+quit'])
  })
})
