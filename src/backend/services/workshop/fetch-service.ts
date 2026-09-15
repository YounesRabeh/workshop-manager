/**
 * Domain: Workshop metadata retrieval.
 * Overview: Fetches Steam profile and workshop item metadata for the authenticated user.
 * Responsibility: Loads profile details, 
 * aggregates workshop listings from Steam Web API and Community pages, and normalizes merged results.
 */
import type {
  SteamProfileSummary,
  WorkshopItemSummary,
  WorkshopItemsPage,
  WorkshopItemsPageInput,
  WorkshopVisibilityFilter
} from '@shared/contracts'
import { normalizeError } from '@shared/api-error-utils'
import { AppError } from '@backend/utils/errors'
import { resolveWorkshopFetchPolicy, type WorkshopFetchPolicy } from './fetch-policy'
import {
  extractMaxWorkshopPage,
  extractWorkshopFileIdsFromHtml,
  extractXmlTagValue,
  mergeWorkshopItems,
  normalizeWorkshopItems
} from '../steam/output-parser'

interface WorkshopFetchContext {
  getLoginState: () => { username: string; steamId64?: string } | null
  appendDiagnosticLog?: (line: string) => void | Promise<void>
}

export type WorkshopWebApiAccessState = 'active' | 'configured_unavailable' | 'disabled'

const WEB_API_PRIVACY_BY_FILTER: Partial<Record<WorkshopVisibilityFilter, string>> = {
  public: '0',
  friends: '1',
  hidden: '2',
  unlisted: '3'
}

function matchesVisibility(item: WorkshopItemSummary, filter: WorkshopVisibilityFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'unknown') return item.visibility === undefined
  return item.visibility === Number(WEB_API_PRIVACY_BY_FILTER[filter])
}

function normalizePageInput(input: WorkshopItemsPageInput): Required<Pick<WorkshopItemsPageInput, 'page' | 'pageSize'>> & Pick<WorkshopItemsPageInput, 'appId' | 'visibility'> {
  if (!Number.isSafeInteger(input.page) || input.page < 1) throw new AppError('validation', 'Workshop page must be a positive integer.')
  if (!Number.isSafeInteger(input.pageSize) || input.pageSize < 1 || input.pageSize > 100) {
    throw new AppError('validation', 'Workshop page size must be between 1 and 100.')
  }
  const appId = input.appId?.trim() || undefined
  if (appId && !/^\d+$/.test(appId)) {
    throw new AppError('validation', 'Workshop App ID filter must contain digits only.')
  }
  return {
    appId,
    page: input.page,
    pageSize: input.pageSize,
    visibility: input.visibility ?? 'all'
  }
}

function errorMessage(error: unknown): string {
  return normalizeError(error).message
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

function extractPublishedFileIds(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object') {
    return []
  }

  const response = payload as {
    response?: {
      publishedfiledetails?: Array<Record<string, unknown>>
      publishedfileids?: Array<Record<string, unknown>>
    }
  }

  const raw = response.response?.publishedfiledetails ?? response.response?.publishedfileids ?? []
  const ids = new Set<string>()

  for (const item of raw) {
    const value = item?.['publishedfileid']
    const normalized = typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''
    if (normalized.length > 0) {
      ids.add(normalized)
    }
  }

  return [...ids]
}

export class WorkshopFetchService {
  private readonly policy: WorkshopFetchPolicy

  constructor(private readonly context: WorkshopFetchContext, policy: Partial<WorkshopFetchPolicy> = {}) {
    this.policy = resolveWorkshopFetchPolicy(policy)
  }

  private fetchSteam(input: string, init: RequestInit = {}): Promise<Response> {
    return fetch(input, { ...init, signal: AbortSignal.timeout(this.policy.requestTimeoutMs) })
  }

  private appendDiagnosticLog(line: string): void {
    const result = this.context.appendDiagnosticLog?.(`[API_META] ${line}`)
    if (result) {
      void Promise.resolve(result).catch(() => undefined)
    }
  }

  private countRawPublishedFileRows(payload: unknown): number {
    if (!payload || typeof payload !== 'object') {
      return 0
    }

    const response = payload as {
      response?: {
        publishedfiledetails?: Array<Record<string, unknown>>
        publishedfileids?: Array<Record<string, unknown>>
      }
    }

    return (response.response?.publishedfiledetails ?? response.response?.publishedfileids ?? []).length
  }

  private async fetchPublishedFileDetails(ids: string[]): Promise<WorkshopItemSummary[]> {
    const items: WorkshopItemSummary[] = []
    const batchSize = this.policy.detailsBatchSize

    for (let start = 0; start < ids.length; start += batchSize) {
      const batch = ids.slice(start, start + batchSize)
      this.appendDiagnosticLog(`details request ids=${batch.length}`)
      const detailsParams = new URLSearchParams({ itemcount: String(batch.length) })
      for (const [index, id] of batch.entries()) {
        detailsParams.set(`publishedfileids[${index}]`, id)
      }

      const detailsResponse = await this.fetchSteam(
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
        this.appendDiagnosticLog(`details response status=${detailsResponse.status}`)
        throw new AppError(
          'command_failed',
          `Workshop details fetch failed with status ${detailsResponse.status}`
        )
      }

      const payload = (await detailsResponse.json()) as unknown
      const normalized = normalizeWorkshopItems(payload)
      this.appendDiagnosticLog(
        `details response status=${detailsResponse.status} rawRows=${this.countRawPublishedFileRows(payload)} normalized=${normalized.length}`
      )
      items.push(...normalized)
    }

    return mergeWorkshopItems(items)
  }

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
      const response = await this.fetchSteam(`${profileUrl}/?xml=1`)
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
    const apiKey = allowWebApi ? savedWebApiKey?.trim() : undefined
    const failures: string[] = []
    let webApiItems: WorkshopItemSummary[] = []
    let communityItems: WorkshopItemSummary[] = []

    this.appendDiagnosticLog(
      `workshop list start steamId64=${loginState.steamId64} appId=${normalizedAppId ?? 'all'} webApiAccess=${options.webApiAccess ?? 'unknown'} allowWebApi=${allowWebApi} apiKeyPresent=${Boolean(apiKey)}`
    )

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
    } else {
      this.appendDiagnosticLog('web_api skipped reason=no_usable_key_or_disabled')
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
          this.appendDiagnosticLog(`web_api outcome=ok items=${outcome.items.length}`)
        } else {
          communityItems = outcome.items
          this.appendDiagnosticLog(`community outcome=ok items=${outcome.items.length}`)
        }
        continue
      }

      if (outcome.source === 'web_api') {
        failures.push(`Web API: ${errorMessage(outcome.error)}`)
        this.appendDiagnosticLog(`web_api outcome=failed error=${errorMessage(outcome.error)}`)
      } else {
        failures.push(`Community: ${errorMessage(outcome.error)}`)
        this.appendDiagnosticLog(`community outcome=failed error=${errorMessage(outcome.error)}`)
      }
    }

    const combined = mergeWorkshopItems([...webApiItems, ...communityItems])
    this.appendDiagnosticLog(
      `workshop list combined webApiItems=${webApiItems.length} communityItems=${communityItems.length} merged=${combined.length} failures=${failures.length}`
    )
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

  async getMyWorkshopItemsPage(
    input: WorkshopItemsPageInput,
    savedWebApiKey?: string,
    options: { allowWebApi?: boolean; webApiAccess?: WorkshopWebApiAccessState } = {}
  ): Promise<WorkshopItemsPage> {
    const request = normalizePageInput(input)
    const loginState = this.context.getLoginState()
    if (!loginState) throw new AppError('auth', 'Login is required before loading workshop items')
    if (!loginState.steamId64) {
      throw new AppError('auth', unresolvedIdentityMessage('workshop', options.webApiAccess))
    }

    const apiKey = options.allowWebApi === false ? undefined : savedWebApiKey?.trim()
    if (apiKey) {
      try {
        return await this.getWorkshopItemsPageWithWebApi(apiKey, loginState.steamId64, request)
      } catch (error) {
        this.appendDiagnosticLog(`paged web_api failed error=${errorMessage(error)}; falling back to community`)
      }
    }
    return await this.getWorkshopItemsPageWithCommunity(loginState.steamId64, request)
  }

  private async getWorkshopItemsPageWithWebApi(
    apiKey: string,
    steamId64: string,
    request: ReturnType<typeof normalizePageInput>
  ): Promise<WorkshopItemsPage> {
    const params = new URLSearchParams({
      key: apiKey,
      steamid: steamId64,
      appid: request.appId ?? '0',
      numperpage: String(request.pageSize),
      page: String(request.page),
      return_details: 'true'
    })
    const privacy = WEB_API_PRIVACY_BY_FILTER[request.visibility ?? 'all']
    if (privacy !== undefined) params.set('privacy', privacy)

    const response = await this.fetchSteam(
      `https://api.steampowered.com/IPublishedFileService/GetUserFiles/v1/?${params.toString()}`
    )
    if (!response.ok) throw new AppError('command_failed', `Workshop item fetch failed with status ${response.status}`)
    const payload = (await response.json()) as unknown
    let items = normalizeWorkshopItems(payload)
    const rawRows = this.countRawPublishedFileRows(payload)
    if (items.length === 0) {
      const ids = extractPublishedFileIds(payload)
      if (ids.length > 0) items = await this.fetchPublishedFileDetails(ids)
    }
    items = items.filter((item) => matchesVisibility(item, request.visibility ?? 'all'))
    const totalValue = (payload as { response?: { total?: unknown } })?.response?.total
    const total = typeof totalValue === 'number' || typeof totalValue === 'string' ? Number(totalValue) : NaN
    return {
      items,
      page: request.page,
      pageSize: request.pageSize,
      hasNext: Number.isFinite(total) ? request.page * request.pageSize < total : rawRows >= request.pageSize,
      ...(Number.isFinite(total) ? { totalItems: total } : {})
    }
  }

  private async getWorkshopItemsPageWithCommunity(
    steamId64: string,
    request: ReturnType<typeof normalizePageInput>
  ): Promise<WorkshopItemsPage> {
    const allItems = await this.getMyWorkshopItemsWithCommunity(steamId64, request.appId)
    const filteredItems = allItems.filter((item) => matchesVisibility(item, request.visibility ?? 'all'))
    const start = (request.page - 1) * request.pageSize
    const items = filteredItems.slice(start, start + request.pageSize)
    return {
      items,
      page: request.page,
      pageSize: request.pageSize,
      hasNext: start + request.pageSize < filteredItems.length,
      totalItems: filteredItems.length
    }
  }

  private async getMyWorkshopItemsWithWebApi(
    apiKey: string,
    steamId64: string,
    appId?: string
  ): Promise<WorkshopItemSummary[]> {
    const perPage = 100
    const maxPages = this.policy.maxWebApiPages
    const privacyModes: Array<{ value?: string }> = [{}, { value: '0' }, { value: '1' }, { value: '2' }, { value: '3' }, { value: '4' }]
    const failures: string[] = []
    const collected: WorkshopItemSummary[] = []

    for (const mode of privacyModes) {
      for (let page = 1; page <= maxPages; page += 1) {
        // Steam's GetUserFiles expects appid. Use 0 as "all apps" when no filter is selected.
        const effectiveAppId = appId && appId.trim().length > 0 ? appId.trim() : '0'
        const privacyLabel = mode.value ?? 'any'
        const params = new URLSearchParams({
          key: apiKey,
          steamid: steamId64,
          appid: effectiveAppId,
          numperpage: String(perPage),
          page: String(page),
          return_details: 'true'
        })
        if (mode.value) {
          params.set('privacy', mode.value)
        }

        const response = await this.fetchSteam(
          `https://api.steampowered.com/IPublishedFileService/GetUserFiles/v1/?${params.toString()}`
        )
        this.appendDiagnosticLog(
          `web_api request appid=${effectiveAppId} privacy=${privacyLabel} page=${page} status=${response.status}`
        )

        if (!response.ok) {
          failures.push(`privacy=${privacyLabel}, page=${page}, status=${response.status}`)
          break
        }

        const payload = (await response.json()) as unknown
        let pageItems = normalizeWorkshopItems(payload)
        const rawRows = this.countRawPublishedFileRows(payload)
        const ids = pageItems.length === 0 ? extractPublishedFileIds(payload) : []
        this.appendDiagnosticLog(
          `web_api response appid=${effectiveAppId} privacy=${privacyLabel} page=${page} rawRows=${rawRows} ids=${ids.length} normalized=${pageItems.length}`
        )
        if (pageItems.length === 0) {
          if (ids.length > 0) {
            pageItems = await this.fetchPublishedFileDetails(ids)
            this.appendDiagnosticLog(
              `web_api details hydrated appid=${effectiveAppId} privacy=${privacyLabel} page=${page} normalized=${pageItems.length}`
            )
          }
        }

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

    const firstPage = await this.fetchSteam(
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
    const seenIds = new Set(allIds)
    const discoveredPages = extractMaxWorkshopPage(firstHtml)
    if (discoveredPages > this.policy.maxCommunityPages) {
      throw new AppError('command_failed', 'Workshop listing exceeds the fetch limit. Narrow the App ID filter and retry.')
    }
    const maxPage = discoveredPages
    this.appendDiagnosticLog(
      `community request appId=${appId ?? 'all'} page=1 status=${firstPage.status} ids=${allIds.length} maxPage=${maxPage}`
    )

    for (let page = 2; page <= maxPage; page += 1) {
      params.set('p', String(page))
      const response = await this.fetchSteam(
        `https://steamcommunity.com/profiles/${steamId64}/myworkshopfiles/?${params.toString()}`
      )
      if (!response.ok) {
        this.appendDiagnosticLog(`community request appId=${appId ?? 'all'} page=${page} status=${response.status}`)
        throw new AppError('command_failed', `Community workshop page ${page} fetch failed with status ${response.status}`)
      }
      const html = await response.text()
      const ids = extractWorkshopFileIdsFromHtml(html)
      this.appendDiagnosticLog(`community request appId=${appId ?? 'all'} page=${page} status=${response.status} ids=${ids.length}`)
      for (const id of ids) {
        if (!seenIds.has(id)) {
          seenIds.add(id)
          allIds.push(id)
        }
      }
    }

    if (allIds.length === 0) {
      return []
    }

    const normalized = await this.fetchPublishedFileDetails(allIds)

    if (appId) {
      return normalized.filter((item) => item.appId === appId)
    }

    return normalized
  }
}
