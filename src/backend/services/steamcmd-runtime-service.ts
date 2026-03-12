import { EventEmitter } from 'node:events'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import type {
  RunEvent,
  RunResult,
  SteamProfileSummary,
  UploadDraft,
  WorkshopItemSummary
} from '@shared/contracts'
import { AppError } from '@backend/utils/errors'
import { validateDraft } from '@backend/utils/validation'
import { generateWorkshopVdf } from './vdf-generator'
import { RunLogStore } from '@backend/stores/run-log-store'

interface LoginState {
  username: string
  steamId64?: string
}

interface GuardPrompt {
  resolve: (code: string) => void
  reject: (error: Error) => void
}

interface RunOptions {
  timeoutMs?: number
  phase: string
  emitOutputEvents?: boolean
}

interface LoginFailure {
  code: 'auth' | 'steam_guard'
  message: string
}

function createRunId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
}

export function isSteamGuardPrompt(line: string): boolean {
  return /two-factor|auth(?:entication)?\s*code|guard code|steam guard code/i.test(line)
}

function isSteamGuardMobilePrompt(line: string): boolean {
  return /steam guard mobile authenticator|waiting for confirmation/i.test(line)
}

function stripAnsi(line: string): string {
  return line.replace(/\u001b\[[0-9;]*m/g, '')
}

function isSteamGuardMobileTimeout(lines: string[]): boolean {
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

function parsePublishedFileId(lines: string[]): string | undefined {
  const joined = lines.join('\n')
  const idMatch = joined.match(/published file id\s*[:=]\s*(\d+)/i)
  return idMatch?.[1]
}

function parseSteamId64(lines: string[]): string | undefined {
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

function extractMaxWorkshopPage(html: string): number {
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

function extractXmlTagValue(xml: string, tag: string): string | undefined {
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

      if (!publishedFileId || !title) {
        return null
      }

      return {
        publishedFileId,
        title,
        previewUrl,
        appId,
        updatedAt,
        visibility
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
        typeof existing.visibility === 'undefined' &&
        typeof item.visibility !== 'undefined')

    if (shouldReplace) {
      merged.set(item.publishedFileId, {
        ...existing,
        ...item,
        // Keep a known visibility when the replacement item omits it.
        visibility: typeof item.visibility === 'undefined' ? existing.visibility : item.visibility
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

function buildLoginArgs(username: string, password: string, useStoredAuth: boolean): string[] {
  if (useStoredAuth) {
    return ['+login', username, '+quit']
  }
  return ['+login', username, password, '+quit']
}

export class SteamCmdRuntimeService extends EventEmitter {
  private loginState: LoginState | null = null
  private activeRuns = new Map<string, ChildProcessWithoutNullStreams>()
  private pendingSteamGuard = new Map<string, GuardPrompt>()

  constructor(
    private readonly steamCmdExecutablePath: () => Promise<string>,
    private readonly runLogStore: RunLogStore,
    private readonly runtimeDir: string
  ) {
    super()
  }

  private emitRunEvent(event: RunEvent): void {
    this.emit('run-event', event)
  }

  private async runSteamCmd(
    runId: string,
    args: string[],
    options: RunOptions
  ): Promise<{ lines: string[]; exitCode: number }> {
    const executablePath = await this.steamCmdExecutablePath()
    const lines: string[] = []
    await mkdir(this.runtimeDir, { recursive: true })
    await this.runLogStore.create(runId)

    this.emitRunEvent({ runId, ts: Date.now(), type: 'run_started', phase: options.phase })

    return await new Promise((resolve, reject) => {
      const child = spawn(executablePath, args, { cwd: this.runtimeDir, stdio: 'pipe' })
      this.activeRuns.set(runId, child)
      let guardMobilePromptSent = false
      let logWriteQueue: Promise<void> = Promise.resolve()
      const shouldEmitOutputEvents = options.emitOutputEvents === true
      const isLoginPhase = options.phase === 'login'

      const timeoutMs = options.timeoutMs ?? 5 * 60_000

      const timeout = setTimeout(() => {
        child.kill('SIGTERM')
        reject(new AppError('timeout', `SteamCMD run exceeded timeout (${timeoutMs}ms)`))
      }, timeoutMs)

      const onLine = async (line: string, type: 'stdout' | 'stderr') => {
        const normalizedLine = stripAnsi(line).trim()
        if (!normalizedLine) {
          return
        }

        if (isLoginPhase && isSteamGuardMobilePrompt(normalizedLine) && guardMobilePromptSent === false) {
          guardMobilePromptSent = true
          this.emitRunEvent({
            runId,
            ts: Date.now(),
            type: 'steam_guard_required',
            phase: options.phase,
            promptType: 'steam_guard_mobile'
          })
        }

        if (isLoginPhase && isSteamGuardPrompt(normalizedLine) && this.pendingSteamGuard.has(runId) === false) {
          this.emitRunEvent({
            runId,
            ts: Date.now(),
            type: 'steam_guard_required',
            phase: options.phase,
            promptType: 'steam_guard_code'
          })

          // SteamCMD reads guard code from stdin after prompting.
          const guardPromise = new Promise<string>((guardResolve, guardReject) => {
            this.pendingSteamGuard.set(runId, {
              resolve: guardResolve,
              reject: guardReject
            })
          })

          try {
            const guardCode = await guardPromise
            child.stdin.write(`${guardCode}\n`)
          } catch (error) {
            reject(error)
          } finally {
            this.pendingSteamGuard.delete(runId)
          }
        }

        lines.push(normalizedLine)
        logWriteQueue = logWriteQueue
          .then(() => this.runLogStore.appendLine(runId, normalizedLine))
          .catch(() => undefined)
        if (shouldEmitOutputEvents) {
          this.emitRunEvent({ runId, ts: Date.now(), type, line: normalizedLine, phase: options.phase })
        }

      }

      child.stdout.on('data', async (chunk: Buffer) => {
        const value = chunk.toString('utf8').split(/\r?\n/).filter(Boolean)
        for (const line of value) {
          await onLine(line, 'stdout')
        }
      })

      child.stderr.on('data', async (chunk: Buffer) => {
        const value = chunk.toString('utf8').split(/\r?\n/).filter(Boolean)
        for (const line of value) {
          await onLine(line, 'stderr')
        }
      })

      child.once('error', (error) => {
        clearTimeout(timeout)
        reject(new AppError('command_failed', `SteamCMD spawn failed: ${error.message}`))
      })

      child.once('close', (exitCode) => {
        void (async () => {
          clearTimeout(timeout)
          this.activeRuns.delete(runId)
          await logWriteQueue
          resolve({ lines, exitCode: exitCode ?? 1 })
        })()
      })
    })
  }

  async login(username: string, password: string, useStoredAuth = false): Promise<{ sessionId: string }> {
    const runId = createRunId()
    const args = buildLoginArgs(username, password, useStoredAuth)
    const timeoutMs = useStoredAuth ? 20_000 : 30_000

    const result = await this.runSteamCmd(runId, args, { phase: 'login', timeoutMs, emitOutputEvents: true })
    const parsedFailure = parseSteamLoginFailure(result.lines)

    if (result.exitCode !== 0 || parsedFailure) {
      if (isSteamGuardMobileTimeout(result.lines)) {
        this.emitRunEvent({ runId, ts: Date.now(), type: 'run_failed', phase: 'login', errorCode: 'steam_guard' })
        await this.runLogStore.finalize(runId, {
          success: false,
          status: 'failed'
        })
        throw new AppError(
          'steam_guard',
          'Steam Guard mobile confirmation timed out. Approve the login in the Steam mobile app, then retry.'
        )
      }

      const failure = parsedFailure
        ? useStoredAuth && parsedFailure.code === 'auth'
          ? {
              code: 'auth' as const,
              message: 'Saved Steam session is not available. Enter password to sign in again.'
            }
          : parsedFailure
        : {
            code: 'auth' as const,
            message: useStoredAuth
              ? 'Saved Steam session is not available. Enter password to sign in again.'
              : 'Steam login failed. Check credentials or guard code.'
          }

      this.emitRunEvent({ runId, ts: Date.now(), type: 'run_failed', phase: 'login', errorCode: failure.code })
      await this.runLogStore.finalize(runId, {
        success: false,
        status: 'failed'
      })
      throw new AppError(failure.code, failure.message)
    }

    this.loginState = { username, steamId64: parseSteamId64(result.lines) }
    this.emitRunEvent({ runId, ts: Date.now(), type: 'run_finished', phase: 'login' })
    await this.runLogStore.finalize(runId, {
      success: true,
      status: 'success'
    })

    return { sessionId: runId }
  }

  logout(): void {
    this.loginState = null
  }

  async getCurrentProfile(): Promise<SteamProfileSummary> {
    if (!this.loginState?.steamId64) {
      throw new AppError('auth', 'Login is required before loading profile info')
    }

    const steamId64 = this.loginState.steamId64
    const profileUrl = `https://steamcommunity.com/profiles/${steamId64}`
    const fallback: SteamProfileSummary = {
      steamId64,
      personaName: this.loginState.username,
      profileUrl
    }

    try {
      const response = await fetch(`${profileUrl}/?xml=1`)
      if (!response.ok) {
        return fallback
      }

      const xml = await response.text()
      const personaName = extractXmlTagValue(xml, 'steamID') ?? this.loginState.username
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

  async getMyWorkshopItems(appId?: string, savedWebApiKey?: string, allowWebApi = true): Promise<WorkshopItemSummary[]> {
    if (!this.loginState?.steamId64) {
      throw new AppError('auth', 'Login is required before loading workshop items')
    }

    const normalizedAppId = appId?.trim() || undefined
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
        this.getMyWorkshopItemsWithWebApi(apiKey, normalizedAppId)
          .then((items) => ({ source: 'web_api' as const, ok: true as const, items }))
          .catch((error: unknown) => ({ source: 'web_api' as const, ok: false as const, error }))
      )
    }

    tasks.push(
      this.getMyWorkshopItemsWithCommunity(normalizedAppId)
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

  private async getMyWorkshopItemsWithWebApi(apiKey: string, appId?: string): Promise<WorkshopItemSummary[]> {
    const perPage = 100
    const maxPages = 20
    const privacyModes: Array<{ value?: string }> = [
      {},
      { value: '0' },
      { value: '1' },
      { value: '2' },
      { value: '3' },
      { value: '4' }
    ]
    const failures: string[] = []
    const collected: WorkshopItemSummary[] = []

    for (const mode of privacyModes) {
      for (let page = 1; page <= maxPages; page += 1) {
        const params = new URLSearchParams({
          key: apiKey,
          steamid: this.loginState!.steamId64!,
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

  private async getMyWorkshopItemsWithCommunity(appId?: string): Promise<WorkshopItemSummary[]> {
    const steamId64 = this.loginState!.steamId64!
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

  submitSteamGuardCode(sessionId: string, code: string): void {
    const pending = this.pendingSteamGuard.get(sessionId)
    if (!pending) {
      throw new AppError('steam_guard', 'No Steam Guard prompt is currently waiting for this session')
    }
    pending.resolve(code.trim())
  }

  cancelRun(runId: string): void {
    const processHandle = this.activeRuns.get(runId)
    if (!processHandle) {
      return
    }
    processHandle.kill('SIGTERM')
    this.emitRunEvent({ runId, ts: Date.now(), type: 'run_cancelled', phase: 'cancelled' })
  }

  async upload(draft: UploadDraft, mode: 'upload' | 'update' | 'visibility'): Promise<RunResult> {
    if (!this.loginState) {
      throw new AppError('auth', 'You must login before uploading or updating mods')
    }

    validateDraft(draft, mode)

    const runId = createRunId()
    const vdfPath = join(this.runtimeDir, `${runId}.vdf`)
    await mkdir(this.runtimeDir, { recursive: true })
    await writeFile(vdfPath, generateWorkshopVdf(draft, mode), 'utf8')

    const args = buildWorkshopArgs(this.loginState.username, undefined, vdfPath)

    this.emitRunEvent({ runId, ts: Date.now(), type: 'phase_changed', phase: mode })

    const commandResult = await this.runSteamCmd(runId, args, {
      phase: mode,
      timeoutMs: 10 * 60_000,
      emitOutputEvents: false
    })

    if (commandResult.exitCode !== 0) {
      this.emitRunEvent({ runId, ts: Date.now(), type: 'run_failed', phase: mode, errorCode: 'command_failed' })
      const failed = await this.runLogStore.finalize(runId, {
        success: false,
        status: 'failed'
      })
      throw new AppError('command_failed', `Workshop ${mode} failed. See run logs for details.`)
    }

    const publishedFileId = parsePublishedFileId(commandResult.lines) ?? draft.publishedFileId
    const persisted = await this.runLogStore.finalize(runId, {
      success: true,
      status: 'success',
      publishedFileId
    })

    const result: RunResult = {
      runId,
      success: true,
      publishedFileId,
      steamOutputSummary: persisted.steamOutputSummary,
      logPath: persisted.logPath
    }

    this.emitRunEvent({ runId, ts: Date.now(), type: 'run_finished', phase: mode })
    return result
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return 'unknown error'
}
