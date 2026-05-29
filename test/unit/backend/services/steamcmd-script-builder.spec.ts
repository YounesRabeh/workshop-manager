import { describe, expect, it } from 'vitest'
import {
  buildSteamCmdLoginScript,
  buildSteamCmdScriptDirectives,
  buildSteamCmdWorkshopScript
} from '@backend/services/steamcmd-script-builder'

describe('steamcmd script builder', () => {
  it('builds secure default directives', () => {
    expect(buildSteamCmdScriptDirectives({})).toEqual(['@ShutdownOnFailedCommand 1'])
  })

  it('builds login scripts with no-password prompt suppression when password is omitted', () => {
    const script = buildSteamCmdLoginScript({
      username: 'alice'
    })

    expect(script).toContain('@ShutdownOnFailedCommand 1')
    expect(script).toContain('@NoPromptForPassword 1')
    expect(script).toContain('login alice')
    expect(script).toContain('\nquit\n')
  })

  it('builds login scripts with password and guard code', () => {
    const script = buildSteamCmdLoginScript({
      username: 'alice',
      password: 'secret pass',
      steamGuardCode: '12345'
    })

    expect(script).toContain('login alice "secret pass" 12345')
    expect(script).not.toContain('@NoPromptForPassword 1')
  })

  it('builds workshop scripts with quoted VDF paths', () => {
    const script = buildSteamCmdWorkshopScript({
      username: 'alice',
      vdfPath: '/tmp/mod files/item.vdf'
    })

    expect(script).toContain('login alice')
    expect(script).toContain('workshop_build_item "/tmp/mod files/item.vdf"')
    expect(script).toContain('@NoPromptForPassword 1')
    expect(script).toContain('\nquit\n')
  })

  it('throws validation errors for missing required values', () => {
    expect(() =>
      buildSteamCmdLoginScript({
        username: ''
      })
    ).toThrow('username is required')

    expect(() =>
      buildSteamCmdWorkshopScript({
        username: 'alice',
        vdfPath: ''
      })
    ).toThrow('vdfPath is required')
  })
})

