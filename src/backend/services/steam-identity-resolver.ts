/**
 * Overview: Resolves the authenticated Steam account identity used by profile and workshop fetches.
 * Responsibility: Validates SteamCMD-derived IDs and applies platform-specific fallback resolution when needed.
 */
import { readFile } from 'node:fs/promises'
import {
  extractXmlTagValue,
  isValidSteamId64,
  parseSteamId64,
  steamId64FromAccountId
} from './steam-output-parser'
import {
  getSteamCmdPlatformBehavior,
  type SteamCmdPlatformBehavior,
  type SteamCmdPlatformProfile
} from './steamcmd-platform-profile'

const CONNECTION_LOG_TAIL_BYTES = 128 * 1024

interface ResolveLoginSteamId64Options {
  connectionLogPaths?: string[]
}

export function parseSteamId64FromProfileXml(xml: string): string | undefined {
  const candidate = extractXmlTagValue(xml, 'steamID64')
  return isValidSteamId64(candidate) ? candidate : undefined
}

function normalizeSteamCommunityReference(
  value: string
): { steamId64?: string; profileXmlUrl?: string } | undefined {
  const normalized = value.trim()
  if (!normalized) {
    return undefined
  }

  const maybeSteamId64 = normalized
  if (isValidSteamId64(maybeSteamId64)) {
    return { steamId64: maybeSteamId64 }
  }

  const candidate =
    !/^[a-z]+:\/\//i.test(normalized) && /steamcommunity\.com\//i.test(normalized)
      ? `https://${normalized.replace(/^\/+/, '')}`
      : normalized

  try {
    const parsed = new URL(candidate)
    if (!/^(?:www\.)?steamcommunity\.com$/i.test(parsed.hostname)) {
      return undefined
    }

    const segments = parsed.pathname.split('/').filter(Boolean)
    if (segments[0] === 'profiles' && isValidSteamId64(segments[1])) {
      return { steamId64: segments[1] }
    }

    if (segments[0] === 'id' && segments[1]) {
      return {
        profileXmlUrl: `https://steamcommunity.com/id/${encodeURIComponent(segments[1])}/?xml=1`
      }
    }
  } catch {
    return undefined
  }

  return undefined
}

export function parseSteamId64FromConnectionLog(logContent: string): string | undefined {
  const tail = logContent.slice(-CONNECTION_LOG_TAIL_BYTES)
  const steamIdMatches = [...tail.matchAll(/\b(7656119\d{10})\b/g)]
  for (let index = steamIdMatches.length - 1; index >= 0; index -= 1) {
    const candidate = steamIdMatches[index]?.[1]
    if (isValidSteamId64(candidate)) {
      return candidate
    }
  }

  const accountMatches = [...tail.matchAll(/\[U:1:(\d+)\]/g)]
  for (let index = accountMatches.length - 1; index >= 0; index -= 1) {
    const candidate = steamId64FromAccountId(accountMatches[index]?.[1] ?? '')
    if (candidate) {
      return candidate
    }
  }

  return undefined
}

export class SteamIdentityResolver {
  private readonly platformBehavior: SteamCmdPlatformBehavior

  constructor(platformProfile: SteamCmdPlatformProfile) {
    this.platformBehavior = getSteamCmdPlatformBehavior(platformProfile)
  }

  async resolveLoginSteamId64(
    username: string,
    loginLines: string[],
    options: ResolveLoginSteamId64Options = {}
  ): Promise<string | undefined> {
    const fromOutput = parseSteamId64(loginLines)
    if (fromOutput) {
      return fromOutput
    }

    const fromConnectionLogs = await this.resolveFromConnectionLogs(options.connectionLogPaths ?? [])
    if (fromConnectionLogs) {
      return fromConnectionLogs
    }

    if (this.platformBehavior.identityResolution !== 'steamcmd_output_then_custom_profile') {
      return undefined
    }

    return await this.resolveFromCustomProfile(username)
  }

  async resolveFromConnectionLogs(paths: string[]): Promise<string | undefined> {
    const candidates = [...new Set(paths.map((path) => path.trim()).filter((path) => path.length > 0))]
    for (const path of candidates) {
      try {
        const content = await readFile(path, 'utf8')
        const steamId64 = parseSteamId64FromConnectionLog(content)
        if (steamId64) {
          return steamId64
        }
      } catch {
        continue
      }
    }

    return undefined
  }

  async resolveFromCustomProfile(username: string): Promise<string | undefined> {
    const reference = normalizeSteamCommunityReference(username)
    if (!reference) {
      return undefined
    }

    if (reference.steamId64) {
      return reference.steamId64
    }

    try {
      const response = await fetch(reference.profileXmlUrl!)
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
