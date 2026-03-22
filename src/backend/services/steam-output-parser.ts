/**
 * Overview: Provides SteamCMD output parsers and helpers used by runtime/workshop services.
 * Responsibility: Detects login/workshop outcomes, normalizes Steam API/community payloads,
 *  and builds safe argument fragments for SteamCMD commands.
 */
import type { UploadDraft, WorkshopItemSummary } from '@shared/contracts'

export interface LoginFailure {
  code: 'auth' | 'steam_guard'
  message: string
}

export function isSteamGuardPrompt(line: string): boolean {
  return /two-factor|auth(?:entication)?\s*code|guard code|steam guard code/i.test(line)
}

export function isSteamGuardMobilePrompt(line: string): boolean {
  return /steam guard mobile authenticator|waiting for confirmation/i.test(line)
}

export function stripAnsi(line: string): string {
  return line.replace(/\u001b\[[0-9;]*m/g, '')
}

export function isSteamGuardMobileTimeout(lines: string[]): boolean {
  const joined = lines.join('\n')
  return /waiting for confirmation timed out|timed out waiting for confirmation|error \(timeout\)/i.test(joined)
}

export function parseSteamLoginFailure(lines: string[]): LoginFailure | undefined {
  const joined = lines.join('\n')

  if (
    /invalid password|incorrect password|password is incorrect|account name or password|login failure:\s*invalidpassword|login failure:\s*invalid/i.test(
      joined
    )
  ) {
    return {
      code: 'auth',
      message: 'Steam login failed: username or password is incorrect.'
    }
  }

  if (
    /invalid auth(?:entication)? code|incorrect auth(?:entication)? code|guard code.*(invalid|incorrect)|two-factor.*(invalid|incorrect)|accountlogondeniedneedtwofactor/i.test(
      joined
    )
  ) {
    return {
      code: 'steam_guard',
      message: 'Steam Guard code is invalid or expired. Enter a fresh code and retry.'
    }
  }

  if (/too many login failures|rate limit|try again later|captcha/i.test(joined)) {
    return {
      code: 'auth',
      message: 'Steam login temporarily blocked due to too many attempts. Wait a bit and retry.'
    }
  }

  if (/cached credentials not found|no cached credentials/i.test(joined)) {
    return {
      code: 'auth',
      message: 'Saved Steam session is not available. Enter password to sign in again.'
    }
  }

  if (/no connection|failed to connect|unable to connect|network|service unavailable/i.test(joined)) {
    return {
      code: 'auth',
      message: 'Steam login failed due to a network/service issue. Check connection and retry.'
    }
  }

  if (/login failure|failed to log on|failed to login/i.test(joined)) {
    return {
      code: 'auth',
      message: 'Steam login failed. Check credentials or guard method.'
    }
  }

  return undefined
}

export function parseWorkshopRunFailure(
  lines: string[],
  mode: 'upload' | 'update' | 'visibility'
): string | undefined {
  const joined = lines.join('\n')
  const retryMatches = joined.match(/\bretrying\.\.\./gi)
  const retryCount = retryMatches?.length ?? 0

  if (/build for workshop item has no content|has no content/i.test(joined)) {
    return 'No mod content found. Select a content folder with files, then retry.'
  }

  if (/timeout uploading manifest/i.test(joined)) {
    return 'Steam upload timed out while sending the manifest. Retry in a minute and check network/Steam service status.'
  }

  if (/error\s*\(\s*no connection\s*\)|failed to connect|unable to connect|service unavailable|network/i.test(joined)) {
    if (retryCount > 0) {
      return `Steam connection failed after ${retryCount} retries. Check internet/Steam status and retry.`
    }
    return 'Steam connection failed. Check internet/Steam status and retry.'
  }

  if (/failed to update workshop item\s*\(failure\)/i.test(joined)) {
    if (mode === 'visibility') {
      return 'Steam failed to change item visibility. Retry shortly.'
    }
    return 'Steam failed to update the Workshop item. Retry shortly; if it persists, verify content folder and Steam service status.'
  }

  if (/not logged on|login failure|please use\s+\+login/i.test(joined)) {
    return 'Steam session is not valid anymore. Sign in again and retry.'
  }

  if (/rate limit|too many requests|try again later/i.test(joined)) {
    return 'Steam rate-limited this request. Wait a bit, then retry.'
  }

  return undefined
}

export function isBenignSteamLatencyWarning(line: string): boolean {
  return /IPC function call IClient(?:UGC|Utils)::[A-Za-z0-9_]+ took too long:\s*\d+\s*msec/i.test(line)
}

export function isWorkshopSuccessLine(line: string): boolean {
  return /\bsuccess\./i.test(line)
}

export function parsePublishedFileId(lines: string[]): string | undefined {
  const joined = lines.join('\n')
  const idMatch = joined.match(/published file id\s*[:=]\s*(\d+)/i)
  return idMatch?.[1]
}

export function parseSteamId64(lines: string[]): string | undefined {
  const joined = lines.join('\n')
  const direct = joined.match(/(7656119\d{10})/)
  if (direct?.[1]) {
    return direct[1]
  }

  const account = joined.match(/\[U:1:(\d+)\]/)
  if (!account?.[1]) {
    return undefined
  }

  const base = 76561197960265728n
  return (base + BigInt(account[1])).toString()
}

function normalizeNumericString(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }
  if (typeof value === 'string') {
    const normalized = value.trim()
    if (/^\d+$/.test(normalized)) {
      return normalized
    }
  }
  return undefined
}

function extractWorkshopTags(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }

  const seen = new Set<string>()
  const tags: string[] = []

  for (const entry of value) {
    let rawTag: unknown = undefined
    if (typeof entry === 'string') {
      rawTag = entry
    } else if (entry && typeof entry === 'object') {
      const record = entry as Record<string, unknown>
      rawTag = record['tag'] ?? record['name'] ?? record['value']
    }

    if (typeof rawTag !== 'string') {
      continue
    }

    const trimmed = rawTag.trim()
    if (!trimmed) {
      continue
    }

    const dedupeKey = trimmed.toLowerCase()
    if (seen.has(dedupeKey)) {
      continue
    }

    seen.add(dedupeKey)
    tags.push(trimmed)
  }

  return tags.length > 0 ? tags : undefined
}

export function normalizeWorkshopItems(payload: unknown): WorkshopItemSummary[] {
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
  const items: WorkshopItemSummary[] = raw
    .map((item): WorkshopItemSummary | null => {
      const publishedFileId = String(item['publishedfileid'] ?? '')
      const title = String(item['title'] ?? '').trim()
      const previewUrl = typeof item['preview_url'] === 'string' ? item['preview_url'] : undefined
      const appId =
        normalizeNumericString(item['consumer_app_id']) ??
        normalizeNumericString(item['consumer_appid']) ??
        normalizeNumericString(item['creator_app_id']) ??
        normalizeNumericString(item['creator_appid'])
      const updatedAt = typeof item['time_updated'] === 'number' ? item['time_updated'] : undefined
      const rawVisibility = item['visibility']
      const visibilityValue =
        typeof rawVisibility === 'number' ? rawVisibility : typeof rawVisibility === 'string' ? Number(rawVisibility) : NaN
      const visibility =
        Number.isInteger(visibilityValue) && visibilityValue >= 0 && visibilityValue <= 3
          ? (visibilityValue as 0 | 1 | 2 | 3)
          : undefined
      const tags = extractWorkshopTags(item['tags'])

      if (!publishedFileId || !title) {
        return null
      }

      return {
        publishedFileId,
        title,
        previewUrl,
        appId,
        updatedAt,
        visibility,
        tags
      }
    })
    .filter((item): item is WorkshopItemSummary => item !== null)

  return items.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
}

export function mergeWorkshopItems(items: WorkshopItemSummary[]): WorkshopItemSummary[] {
  const merged = new Map<string, WorkshopItemSummary>()

  for (const item of items) {
    const existing = merged.get(item.publishedFileId)
    if (!existing) {
      merged.set(item.publishedFileId, item)
      continue
    }

    const existingUpdated = existing.updatedAt ?? 0
    const candidateUpdated = item.updatedAt ?? 0
    const shouldReplace =
      candidateUpdated > existingUpdated ||
      (candidateUpdated === existingUpdated &&
        ((typeof existing.visibility === 'undefined' && typeof item.visibility !== 'undefined') ||
          ((existing.tags?.length ?? 0) === 0 && (item.tags?.length ?? 0) > 0)))

    if (shouldReplace) {
      merged.set(item.publishedFileId, {
        ...existing,
        ...item,
        visibility: typeof item.visibility === 'undefined' ? existing.visibility : item.visibility,
        tags: item.tags && item.tags.length > 0 ? item.tags : existing.tags
      })
    }
  }

  return [...merged.values()].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
}

export function buildWorkshopArgs(
  username: string,
  password: string | undefined,
  vdfPath: string
): string[] {
  const args = ['+login', username]
  if (password && password.trim().length > 0) {
    args.push(password)
  }
  args.push('+workshop_build_item', vdfPath, '+quit')
  return args
}

export function buildLoginArgs(username: string, password: string, useStoredAuth: boolean): string[] {
  if (useStoredAuth) {
    return ['+login', username, '+quit']
  }
  return ['+login', username, password, '+quit']
}

export function extractWorkshopFileIdsFromHtml(html: string): string[] {
  const ids: string[] = []
  const seen = new Set<string>()
  const regex = /sharedfiles\/filedetails\/\?id=(\d+)/g

  let match: RegExpExecArray | null
  while ((match = regex.exec(html)) !== null) {
    const id = match[1]
    if (!seen.has(id)) {
      seen.add(id)
      ids.push(id)
    }
  }

  return ids
}

export function extractMaxWorkshopPage(html: string): number {
  const pageRegex = /[?&]p=(\d+)/g
  let max = 1
  let match: RegExpExecArray | null
  while ((match = pageRegex.exec(html)) !== null) {
    const page = Number(match[1])
    if (Number.isFinite(page) && page > max) {
      max = page
    }
  }
  return max
}

export function extractXmlTagValue(xml: string, tag: string): string | undefined {
  const cdata = xml.match(new RegExp(`<${tag}><!\\[CDATA\\[(.*?)\\]\\]><\\/${tag}>`, 'i'))
  if (cdata?.[1]) {
    return cdata[1].trim()
  }

  const plain = xml.match(new RegExp(`<${tag}>([^<]+)<\\/${tag}>`, 'i'))
  if (plain?.[1]) {
    return plain[1].trim()
  }

  return undefined
}

export function isLoginSuccessLine(line: string): boolean {
  return /waiting for user info.*ok|waiting for compat in post-logon.*ok|logged in ok|login complete|successfully logged/i.test(
    line
  )
}

export function escapeInteractiveArg(value: string): string {
  if (value.length === 0) {
    return '""'
  }
  if (/\s|"/.test(value)) {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
  }
  return value
}

export function normalizeReleaseNoteForDraft(draft: UploadDraft): string | undefined {
  const normalizedReleaseNote = (draft.changenote ?? '').replace(/\r\n/g, '\n').trim()
  return normalizedReleaseNote.length > 0 ? normalizedReleaseNote : undefined
}
