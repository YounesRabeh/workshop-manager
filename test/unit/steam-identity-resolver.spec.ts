import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  parseSteamId64FromProfileXml,
  SteamIdentityResolver
} from '../../src/backend/services/steam-identity-resolver'

describe('SteamIdentityResolver', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('extracts a valid steamId64 from Steam profile XML', () => {
    const xml = `
      <profile>
        <steamID><![CDATA[Alice]]></steamID>
        <steamID64>76561198000000042</steamID64>
      </profile>
    `

    expect(parseSteamId64FromProfileXml(xml)).toBe('76561198000000042')
  })

  it('resolves the Windows custom profile XML fallback when SteamCMD output lacks a usable id', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('<profile><steamID64>76561198000000042</steamID64></profile>', {
        status: 200,
        headers: { 'content-type': 'application/xml' }
      })
    )

    const resolver = new SteamIdentityResolver('windows')
    const steamId64 = await resolver.resolveLoginSteamId64('alice', [
      "Logging in user 'alice' [U:1:0] to Steam Public...",
      'Waiting for user info...OK'
    ])

    expect(steamId64).toBe('76561198000000042')
    expect(globalThis.fetch).toHaveBeenCalledWith('https://steamcommunity.com/id/alice/?xml=1')
  })
})
