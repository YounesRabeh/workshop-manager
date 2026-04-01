/**
 * Overview: Fetches Steam profile and workshop item metadata for the authenticated user.
 * Responsibility: Loads profile details, 
 * aggregates workshop listings from Steam Web API and Community pages, and normalizes merged results.
 */
import type { SteamProfileSummary, WorkshopItemSummary } from '@shared/contracts'
import { AppError } from '@backend/utils/errors'
import {
  extractMaxWorkshopPage,
  extractWorkshopFileIdsFromHtml,
  extractXmlTagValue,
  mergeWorkshopItems,
  normalizeWorkshopItems
} from './steam-output-parser'

interface WorkshopFetchContext {
  getLoginState: () => { username: string; steamId64?: string } | null
}

export type WorkshopWebApiAccessState = 'active' | 'configured_unavailable' | 'disabled'

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return 'unknown error'
}

function unresolvedIdentityMessage(
  target: 'profile' | 'workshop',
  webApiAccess: WorkshopWebApiAccessState = 'disabled'
): string {
  const action =
    target === 'profile'
      ? 'Profile loading cannot continue until Steam ID resolution succeeds.'
      : 'Workshop loading cannot continue until Steam ID resolution succeeds.'
  const webApiHint =
    webApiAccess === 'active'
      ? ' Steam Web API access is active, but these lookups still require a valid SteamID64.'
      : webApiAccess === 'configured_unavailable'
        ? ' Steam Web API key looks configured, but it is unavailable on this device right now.'
        : ' Steam Web API access is not active for this device.'

  return `Signed in to Steam, but account identity could not be resolved on this platform. ${action}${webApiHint}`
}

export class WorkshopFetchService {
  constructor(private readonly context: WorkshopFetchContext) {}

  async getCurrentProfile(): Promise<SteamProfileSummary> {
    const loginState = this.context.getLoginState()
    if (!loginState) {
      throw new AppError('auth', 'Login is required before loading profile info')
    }
    if (!loginState.steamId64) {
      throw new AppError('auth', unresolvedIdentityMessage('profile'))
    }

    const steamId64 = loginState.steamId64
    const profileUrl = `https://steamcommunity.com/profiles/${steamId64}`
    const fallback: SteamProfileSummary = {
      steamId64,
      personaName: loginState.username,
      profileUrl
    }

    try {
      const response = await fetch(`${profileUrl}/?xml=1`)
      if (!response.ok) {
        return fallback
      }

      const xml = await response.text()
      const personaName = extractXmlTagValue(xml, 'steamID') ?? loginState.username
      const avatarUrl =
        extractXmlTagValue(xml, 'avatarFull') ??
        extractXmlTagValue(xml, 'avatarMedium') ??
        extractXmlTagValue(xml, 'avatarIcon')

      return {
        steamId64,
        personaName,
        avatarUrl,
        profileUrl
      }
    } catch {
      return fallback
    }
  }

  async getMyWorkshopItems(
    appId?: string,
    savedWebApiKey?: string,
    options: {
      allowWebApi?: boolean
      webApiAccess?: WorkshopWebApiAccessState
    } = {}
  ): Promise<WorkshopItemSummary[]> {
    const loginState = this.context.getLoginState()
    if (!loginState) {
      throw new AppError('auth', 'Login is required before loading workshop items')
    }
    if (!loginState.steamId64) {
      throw new AppError(
        'auth',
        unresolvedIdentityMessage('workshop', options.webApiAccess)
      )
    }

    const normalizedAppId = appId?.trim() || undefined
    const allowWebApi = options.allowWebApi ?? true
    const apiKey = allowWebApi ? savedWebApiKey?.trim() || process.env['STEAM_WEB_API_KEY']?.trim() : undefined
    const failures: string[] = []
    let webApiItems: WorkshopItemSummary[] = []
    let communityItems: WorkshopItemSummary[] = []

    type WorkshopFetchOutcome =
      | { source: 'web_api' | 'community'; ok: true; items: WorkshopItemSummary[] }
      | { source: 'web_api' | 'community'; ok: false; error: unknown }

    const tasks: Array<Promise<WorkshopFetchOutcome>> = []

    if (apiKey) {
      tasks.push(
        this.getMyWorkshopItemsWithWebApi(apiKey, loginState.steamId64, normalizedAppId)
          .then((items) => ({ source: 'web_api' as const, ok: true as const, items }))
          .catch((error: unknown) => ({ source: 'web_api' as const, ok: false as const, error }))
      )
    }

    tasks.push(
      this.getMyWorkshopItemsWithCommunity(loginState.steamId64, normalizedAppId)
        .then((items) => ({ source: 'community' as const, ok: true as const, items }))
        .catch((error: unknown) => ({ source: 'community' as const, ok: false as const, error }))
    )

    const outcomes = await Promise.all(tasks)
    for (const outcome of outcomes) {
      if (outcome.ok) {
        if (outcome.source === 'web_api') {
          webApiItems = outcome.items
        } else {
          communityItems = outcome.items
        }
        continue
      }

      if (outcome.source === 'web_api') {
        failures.push(`Web API: ${errorMessage(outcome.error)}`)
      } else {
        failures.push(`Community: ${errorMessage(outcome.error)}`)
      }
    }

    const combined = mergeWorkshopItems([...webApiItems, ...communityItems])
    if (combined.length > 0) {
      return combined
    }

    if (failures.length > 0) {
      throw new AppError(
        'command_failed',
        `Failed to load workshop items. ${failures.join(' | ')}. For private profiles, enable Web API in Advanced Options and provide a Steam Web API key.`
      )
    }

    return []
  }

  private async getMyWorkshopItemsWithWebApi(
    apiKey: string,
    steamId64: string,
    appId?: string
  ): Promise<WorkshopItemSummary[]> {
    const perPage = 100
    const maxPages = 20
    const privacyModes: Array<{ value?: string }> = [{}, { value: '0' }, { value: '1' }, { value: '2' }, { value: '3' }, { value: '4' }]
    const failures: string[] = []
    const collected: WorkshopItemSummary[] = []

    for (const mode of privacyModes) {
      for (let page = 1; page <= maxPages; page += 1) {
        const params = new URLSearchParams({
          key: apiKey,
          steamid: steamId64,
          numperpage: String(perPage),
          page: String(page)
        })
        if (mode.value) {
          params.set('privacy', mode.value)
        }

        if (appId) {
          params.set('appid', appId)
        }

        const response = await fetch(
          `https://api.steampowered.com/IPublishedFileService/GetUserFiles/v1/?${params.toString()}`
        )

        if (!response.ok) {
          failures.push(`privacy=${mode.value ?? 'any'}, page=${page}, status=${response.status}`)
          break
        }

        const payload = (await response.json()) as unknown
        const pageItems = normalizeWorkshopItems(payload)

        if (pageItems.length === 0) {
          break
        }

        collected.push(...pageItems)

        if (pageItems.length < perPage) {
          break
        }
      }
    }

    const merged = mergeWorkshopItems(collected)
    if (merged.length > 0) {
      return merged
    }

    if (failures.length > 0) {
      throw new AppError('command_failed', `Workshop item fetch failed (${failures.join(' | ')})`)
    }

    return []
  }

  private async getMyWorkshopItemsWithCommunity(
    steamId64: string,
    appId?: string
  ): Promise<WorkshopItemSummary[]> {
    const params = new URLSearchParams({
      browsefilter: 'myfiles',
      numperpage: '30',
      p: '1'
    })

    if (appId) {
      params.set('appid', appId)
    }

    const firstPage = await fetch(
      `https://steamcommunity.com/profiles/${steamId64}/myworkshopfiles/?${params.toString()}`
    )
    if (!firstPage.ok) {
      throw new AppError(
        'command_failed',
        `Community workshop page fetch failed with status ${firstPage.status}`
      )
    }

    const firstHtml = await firstPage.text()
    const allIds = extractWorkshopFileIdsFromHtml(firstHtml)
    const maxPage = Math.min(extractMaxWorkshopPage(firstHtml), 10)

    for (let page = 2; page <= maxPage; page += 1) {
      params.set('p', String(page))
      const response = await fetch(
        `https://steamcommunity.com/profiles/${steamId64}/myworkshopfiles/?${params.toString()}`
      )
      if (!response.ok) {
        continue
      }
      const html = await response.text()
      const ids = extractWorkshopFileIdsFromHtml(html)
      for (const id of ids) {
        if (!allIds.includes(id)) {
          allIds.push(id)
        }
      }
    }

    if (allIds.length === 0) {
      return []
    }

    const detailsParams = new URLSearchParams({ itemcount: String(allIds.length) })
    for (const [index, id] of allIds.entries()) {
      detailsParams.set(`publishedfileids[${index}]`, id)
    }

    const detailsResponse = await fetch(
      'https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded; charset=UTF-8'
        },
        body: detailsParams.toString()
      }
    )

    if (!detailsResponse.ok) {
      throw new AppError(
        'command_failed',
        `Workshop details fetch failed with status ${detailsResponse.status}`
      )
    }

    const payload = (await detailsResponse.json()) as unknown
    const normalized = normalizeWorkshopItems(payload)

    if (appId) {
      return normalized.filter((item) => item.appId === appId)
    }

    return normalized
  }
}
