import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  parseSteamId64FromConnectionLog,
  parseSteamId64FromProfileXml,
  SteamIdentityResolver
} from '@backend/services/steam-identity-resolver'

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

  it('extracts the last valid steamId64 from a Steam connection log', () => {
    const log = `
      [2026-04-02 12:00:00] SetSteamID( [U:1:0] )
      [2026-04-02 12:00:03] SetSteamID( [U:1:42] )
    `

    expect(parseSteamId64FromConnectionLog(log)).toBe('76561197960265770')
  })

  it('resolves the Windows connection-log fallback when SteamCMD output lacks a usable id', async () => {
    const root = await mkdtemp(join(tmpdir(), 'steam-identity-'))
    const logPath = join(root, 'connection_log.txt')
    await writeFile(logPath, 'SetSteamID( [U:1:42] )\n', 'utf8')

    const resolver = new SteamIdentityResolver('windows')
    const steamId64 = await resolver.resolveLoginSteamId64(
      'alice',
      [
        "Logging in user 'alice' [U:1:0] to Steam Public...",
        'Waiting for user info...OK'
      ],
      {
        connectionLogPaths: [logPath]
      }
    )

    expect(steamId64).toBe('76561197960265770')
  })

  it('uses explicit Steam community profile references for XML fallback instead of assuming account name == vanity URL', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('<profile><steamID64>76561198000000042</steamID64></profile>', {
        status: 200,
        headers: { 'content-type': 'application/xml' }
      })
    )

    const resolver = new SteamIdentityResolver('windows')
    const steamId64 = await resolver.resolveFromCustomProfile('https://steamcommunity.com/id/alice')

    expect(steamId64).toBe('76561198000000042')
    expect(globalThis.fetch).toHaveBeenCalledWith('https://steamcommunity.com/id/alice/?xml=1')
  })

  it('does not probe a guessed vanity URL from a plain Steam account name', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    const resolver = new SteamIdentityResolver('windows')
    const steamId64 = await resolver.resolveFromCustomProfile('plain-account-name')

    expect(steamId64).toBeUndefined()
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
