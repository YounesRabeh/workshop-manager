/**
 * Overview: Resolves the authenticated Steam account identity used by profile and workshop fetches.
 * Responsibility: Validates SteamCMD-derived IDs and applies platform-specific fallback resolution when needed.
 */
import {
  extractXmlTagValue,
  isValidSteamId64,
  parseSteamId64
} from './steam-output-parser'
import {
  getSteamCmdPlatformBehavior,
  type SteamCmdPlatformBehavior,
  type SteamCmdPlatformProfile
} from './steamcmd-platform-profile'

export function parseSteamId64FromProfileXml(xml: string): string | undefined {
  const candidate = extractXmlTagValue(xml, 'steamID64')
  return isValidSteamId64(candidate) ? candidate : undefined
}

export class SteamIdentityResolver {
  private readonly platformBehavior: SteamCmdPlatformBehavior

  constructor(platformProfile: SteamCmdPlatformProfile) {
    this.platformBehavior = getSteamCmdPlatformBehavior(platformProfile)
  }

  async resolveLoginSteamId64(username: string, loginLines: string[]): Promise<string | undefined> {
    const fromOutput = parseSteamId64(loginLines)
    if (fromOutput) {
      return fromOutput
    }

    if (this.platformBehavior.identityResolution !== 'steamcmd_output_then_custom_profile') {
      return undefined
    }

    return await this.resolveFromCustomProfile(username)
  }

  async resolveFromCustomProfile(username: string): Promise<string | undefined> {
    const normalizedUsername = username.trim()
    if (!normalizedUsername) {
      return undefined
    }

    try {
      const response = await fetch(
        `https://steamcommunity.com/id/${encodeURIComponent(normalizedUsername)}/?xml=1`
      )
      if (!response.ok) {
        return undefined
      }

      const xml = await response.text()
      return parseSteamId64FromProfileXml(xml)
    } catch {
      return undefined
    }
  }
}
