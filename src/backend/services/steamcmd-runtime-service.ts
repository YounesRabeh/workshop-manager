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
import { listContentFolderFiles } from './content-folder-scanner'
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

function formatRunMeta(message: string): string {
  return `[RUN_META] ${message}`
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

async function ensureUpdateContentFolderHasFiles(draft: UploadDraft): Promise<void> {
  const contentFolder = draft.contentFolder?.trim()
  if (!contentFolder) {
    return
  }

  try {
    const files = await listContentFolderFiles(contentFolder)
    if (files.length === 0) {
      throw new AppError('validation', 'Selected content folder is empty. Add files or use preview-only update.')
    }
  } catch (error) {
    if (error instanceof AppError) {
      if (error.code === 'validation') {
        throw error
      }
      throw new AppError('command_failed', 'Could not read content folder. Check path/permissions and retry.')
    }
    throw new AppError('command_failed', 'Could not read content folder. Check path/permissions and retry.')
  }
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

type RunPhase = 'login' | 'upload' | 'update' | 'visibility'

interface ActiveInteractiveRun {
  runId: string
  phase: RunPhase
  lines: string[]
  emitOutputEvents: boolean
  timeout: ReturnType<typeof setTimeout>
  settleTimeout: ReturnType<typeof setTimeout> | null
  lineQueue: Promise<void>
  pendingResult: { exitCode: number; runtimeError?: AppError } | null
  guardMobilePromptSent: boolean
  resolve: (value: { lines: string[]; exitCode: number }) => void
  reject: (error: Error) => void
}

function isLoginSuccessLine(line: string): boolean {
  return /waiting for user info.*ok|waiting for compat in post-logon.*ok|logged in ok|login complete|successfully logged/i.test(
    line
  )
}

function escapeInteractiveArg(value: string): string {
  if (value.length === 0) {
    return '""'
  }
  if (/\s|"/.test(value)) {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
  }
  return value
}

export class SteamCmdRuntimeService extends EventEmitter {
  private loginState: LoginState | null = null
  private lastAuthenticatedState: LoginState | null = null
  private activeRuns = new Map<string, ChildProcessWithoutNullStreams>()
  private pendingSteamGuard = new Map<string, GuardPrompt>()
  private persistentProcess: ChildProcessWithoutNullStreams | null = null
  private activeInteractiveRun: ActiveInteractiveRun | null = null
  private commandQueue: Promise<void> = Promise.resolve()
  private stdoutBuffer = ''
  private stderrBuffer = ''

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

  private enqueueCommand<T>(task: () => Promise<T>): Promise<T> {
    const next = this.commandQueue.then(task, task)
    this.commandQueue = next.then(
      () => undefined,
      () => undefined
    )
    return next
  }

  private async ensurePersistentProcess(executablePath?: string): Promise<ChildProcessWithoutNullStreams> {
    if (this.persistentProcess) {
      return this.persistentProcess
    }

    const resolvedExecutablePath = executablePath ?? (await this.steamCmdExecutablePath())
    const child = spawn(resolvedExecutablePath, [], { cwd: this.runtimeDir, stdio: 'pipe' })
    this.persistentProcess = child
    this.stdoutBuffer = ''
    this.stderrBuffer = ''

    child.stdout.on('data', (chunk: Buffer) => {
      this.handleProcessChunk('stdout', chunk)
    })
    child.stderr.on('data', (chunk: Buffer) => {
      this.handleProcessChunk('stderr', chunk)
    })
    child.once('error', (error) => {
      const activeRun = this.activeInteractiveRun
      if (activeRun) {
        this.failActiveRun(activeRun, new AppError('command_failed', `SteamCMD spawn failed: ${error.message}`))
      }
      this.persistentProcess = null
      this.loginState = null
      this.lastAuthenticatedState = null
    })
    child.once('close', (exitCode) => {
      // Flush any trailing non-newline fragments.
      const trailingStdout = this.stdoutBuffer.trim()
      const trailingStderr = this.stderrBuffer.trim()
      this.stdoutBuffer = ''
      this.stderrBuffer = ''
      if (trailingStdout.length > 0) {
        this.routeLineToActiveRun(trailingStdout, 'stdout')
      }
      if (trailingStderr.length > 0) {
        this.routeLineToActiveRun(trailingStderr, 'stderr')
      }

      const activeRun = this.activeInteractiveRun
      if (activeRun) {
        this.failActiveRun(
          activeRun,
          new AppError('command_failed', `SteamCMD process exited unexpectedly (code ${exitCode ?? 1})`)
        )
      }

      this.persistentProcess = null
      this.loginState = null
      this.lastAuthenticatedState = null
    })

    return child
  }

  private handleProcessChunk(stream: 'stdout' | 'stderr', chunk: Buffer): void {
    const incoming = chunk.toString('utf8')
    if (stream === 'stdout') {
      this.stdoutBuffer += incoming
      const parts = this.stdoutBuffer.split(/\r?\n/)
      this.stdoutBuffer = parts.pop() ?? ''
      for (const part of parts) {
        this.routeLineToActiveRun(part, 'stdout')
      }
      if (this.stdoutBuffer.trim().endsWith('Steam>')) {
        this.routeLineToActiveRun(this.stdoutBuffer, 'stdout')
        this.stdoutBuffer = ''
      }
      return
    }

    this.stderrBuffer += incoming
    const parts = this.stderrBuffer.split(/\r?\n/)
    this.stderrBuffer = parts.pop() ?? ''
    for (const part of parts) {
      this.routeLineToActiveRun(part, 'stderr')
    }
  }

  private routeLineToActiveRun(line: string, type: 'stdout' | 'stderr'): void {
    const activeRun = this.activeInteractiveRun
    if (!activeRun) {
      return
    }

    activeRun.lineQueue = activeRun.lineQueue
      .then(async () => {
        const normalizedLine = stripAnsi(line).trim()
        if (!normalizedLine) {
          return
        }

        if (activeRun.phase === 'login' && isSteamGuardMobilePrompt(normalizedLine) && !activeRun.guardMobilePromptSent) {
          activeRun.guardMobilePromptSent = true
          this.emitRunEvent({
            runId: activeRun.runId,
            ts: Date.now(),
            type: 'steam_guard_required',
            phase: activeRun.phase,
            promptType: 'steam_guard_mobile'
          })
        }

        if (
          activeRun.phase === 'login' &&
          isSteamGuardPrompt(normalizedLine) &&
          this.pendingSteamGuard.has(activeRun.runId) === false
        ) {
          this.emitRunEvent({
            runId: activeRun.runId,
            ts: Date.now(),
            type: 'steam_guard_required',
            phase: activeRun.phase,
            promptType: 'steam_guard_code'
          })

          const guardPromise = new Promise<string>((guardResolve, guardReject) => {
            this.pendingSteamGuard.set(activeRun.runId, {
              resolve: guardResolve,
              reject: guardReject
            })
          })

          try {
            const guardCode = await guardPromise
            this.persistentProcess?.stdin.write(`${guardCode}\n`)
          } catch (error) {
            this.failActiveRun(
              activeRun,
              error instanceof Error ? error : new AppError('steam_guard', 'Steam Guard submission failed')
            )
            return
          } finally {
            this.pendingSteamGuard.delete(activeRun.runId)
          }
        }

        activeRun.lines.push(normalizedLine)
        void this.runLogStore.appendLine(activeRun.runId, normalizedLine).catch(() => undefined)
        if (activeRun.emitOutputEvents && !isBenignSteamLatencyWarning(normalizedLine)) {
          this.emitRunEvent({
            runId: activeRun.runId,
            ts: Date.now(),
            type,
            line: normalizedLine,
            phase: activeRun.phase
          })
        }

        if (activeRun.pendingResult) {
          this.scheduleActiveRunSettle(activeRun)
          return
        }

        if (activeRun.phase === 'login') {
          if (isSteamGuardMobileTimeout(activeRun.lines)) {
            activeRun.pendingResult = { exitCode: 1 }
            this.scheduleActiveRunSettle(activeRun)
            return
          }

          const parsedLoginFailure = parseSteamLoginFailure(activeRun.lines)
          if (parsedLoginFailure) {
            activeRun.pendingResult = { exitCode: 1 }
            this.scheduleActiveRunSettle(activeRun)
            return
          }

          if (isLoginSuccessLine(normalizedLine)) {
            activeRun.pendingResult = { exitCode: 0 }
            this.scheduleActiveRunSettle(activeRun)
          }
          return
        }

        const parsedFailure = parseWorkshopRunFailure(activeRun.lines, activeRun.phase)
        if (
          parsedFailure &&
          /error|failed|no connection|not logged on|rate limit|service unavailable|unable to connect|failed to connect/i.test(
            normalizedLine
          )
        ) {
          activeRun.pendingResult = {
            exitCode: 1
          }
          this.scheduleActiveRunSettle(activeRun)
          return
        }

        if (isWorkshopSuccessLine(normalizedLine)) {
          activeRun.pendingResult = { exitCode: 0 }
          this.scheduleActiveRunSettle(activeRun)
        }
      })
      .catch((error: unknown) => {
        this.failActiveRun(
          activeRun,
          error instanceof Error ? error : new AppError('command_failed', 'SteamCMD line processing failed')
        )
      })
  }

  private scheduleActiveRunSettle(activeRun: ActiveInteractiveRun): void {
    if (activeRun.settleTimeout) {
      clearTimeout(activeRun.settleTimeout)
    }
    activeRun.settleTimeout = setTimeout(() => {
      this.finishActiveRun(activeRun)
    }, 140)
  }

  private finishActiveRun(activeRun: ActiveInteractiveRun): void {
    if (this.activeInteractiveRun !== activeRun) {
      return
    }

    this.activeInteractiveRun = null
    this.activeRuns.delete(activeRun.runId)
    clearTimeout(activeRun.timeout)
    if (activeRun.settleTimeout) {
      clearTimeout(activeRun.settleTimeout)
      activeRun.settleTimeout = null
    }

    const pending = activeRun.pendingResult ?? {
      exitCode: 1,
      runtimeError: new AppError('command_failed', 'SteamCMD run failed')
    }
    const meta =
      pending.runtimeError instanceof AppError
        ? formatRunMeta(
            `command finished phase=${activeRun.phase} exitCode=${pending.exitCode} error=${pending.runtimeError.message}`
          )
        : formatRunMeta(`command finished phase=${activeRun.phase} exitCode=${pending.exitCode}`)
    void this.runLogStore.appendLine(activeRun.runId, meta)

    if (pending.runtimeError) {
      activeRun.reject(pending.runtimeError)
      return
    }

    activeRun.resolve({ lines: activeRun.lines, exitCode: pending.exitCode })
  }

  private failActiveRun(activeRun: ActiveInteractiveRun, error: Error): void {
    if (this.activeInteractiveRun !== activeRun) {
      return
    }
    activeRun.pendingResult = {
      exitCode: 1,
      runtimeError: error instanceof AppError ? error : new AppError('command_failed', error.message)
    }
    this.finishActiveRun(activeRun)
  }

  private buildInteractiveCommand(args: string[], phase: RunPhase): string {
    if (phase === 'login') {
      const loginIndex = args.indexOf('+login')
      if (loginIndex < 0 || !args[loginIndex + 1]) {
        throw new AppError('validation', 'Invalid login command args')
      }
      const username = args[loginIndex + 1]
      const maybePassword = args[loginIndex + 2]
      const hasPassword = Boolean(maybePassword && !maybePassword.startsWith('+'))
      if (hasPassword) {
        return `login ${escapeInteractiveArg(username)} ${escapeInteractiveArg(maybePassword!)}`
      }
      return `login ${escapeInteractiveArg(username)}`
    }

    const workshopIndex = args.indexOf('+workshop_build_item')
    if (workshopIndex < 0 || !args[workshopIndex + 1]) {
      throw new AppError('validation', 'Invalid workshop command args')
    }

    return `workshop_build_item ${escapeInteractiveArg(args[workshopIndex + 1])}`
  }

  private async runSteamCmd(
    runId: string,
    args: string[],
    options: RunOptions
  ): Promise<{ lines: string[]; exitCode: number }> {
    const phase = options.phase as RunPhase
    const timeoutMs = options.timeoutMs ?? 5 * 60_000
    const command = this.buildInteractiveCommand(args, phase)

    return await this.enqueueCommand(async () => {
      const executablePath = await this.steamCmdExecutablePath()
      await mkdir(this.runtimeDir, { recursive: true })
      await this.runLogStore.create(runId)
      this.emitRunEvent({ runId, ts: Date.now(), type: 'run_started', phase })
      await this.ensurePersistentProcess(executablePath)

      await this.runLogStore.appendLine(
        runId,
        formatRunMeta(
          `started phase=${phase} timeoutMs=${timeoutMs} executable=${executablePath}`
        )
      )

      return await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          this.runLogStore
            .appendLine(runId, formatRunMeta(`timeout reached after ${timeoutMs}ms, restarting SteamCMD process`))
            .catch(() => undefined)
          const activeRun = this.activeInteractiveRun
          if (activeRun?.runId === runId) {
            this.failActiveRun(activeRun, new AppError('timeout', `SteamCMD run exceeded timeout (${timeoutMs}ms)`))
          }
          this.persistentProcess?.kill('SIGTERM')
          this.persistentProcess = null
          this.loginState = null
          this.lastAuthenticatedState = null
        }, timeoutMs)

        const activeRun: ActiveInteractiveRun = {
          runId,
          phase,
          lines: [],
          emitOutputEvents: options.emitOutputEvents === true,
          timeout,
          settleTimeout: null,
          lineQueue: Promise.resolve(),
          pendingResult: null,
          guardMobilePromptSent: false,
          resolve,
          reject
        }

        this.activeInteractiveRun = activeRun
        if (this.persistentProcess) {
          this.activeRuns.set(runId, this.persistentProcess)
          this.persistentProcess.stdin.write(`${command}\n`)
        } else {
          this.failActiveRun(activeRun, new AppError('command_failed', 'SteamCMD process is not available'))
        }
      })
    })
  }

  async login(username: string, password: string, useStoredAuth = false): Promise<{ sessionId: string }> {
    const normalizedUsername = username.trim()
    if (!normalizedUsername) {
      throw new AppError('validation', 'Steam username is required')
    }

    const runId = createRunId()
    const args = buildLoginArgs(normalizedUsername, password, useStoredAuth)
    const timeoutMs = useStoredAuth ? 20_000 : 30_000

    if (
      useStoredAuth &&
      this.persistentProcess &&
      this.lastAuthenticatedState?.username === normalizedUsername &&
      !this.activeInteractiveRun
    ) {
      this.loginState = {
        username: this.lastAuthenticatedState.username,
        steamId64: this.lastAuthenticatedState.steamId64
      }
      this.emitRunEvent({ runId, ts: Date.now(), type: 'run_started', phase: 'login' })
      await this.runLogStore.create(runId)
      await this.runLogStore.appendLine(
        runId,
        formatRunMeta('restored active SteamCMD session without re-running login command')
      )
      this.emitRunEvent({ runId, ts: Date.now(), type: 'run_finished', phase: 'login' })
      await this.runLogStore.finalize(runId, {
        success: true,
        status: 'success'
      })
      return { sessionId: runId }
    }

    const result = await this.runSteamCmd(runId, args, { phase: 'login', timeoutMs, emitOutputEvents: true })
    const parsedFailure = parseSteamLoginFailure(result.lines)

    if (result.exitCode !== 0 || parsedFailure) {
      if (useStoredAuth) {
        this.lastAuthenticatedState = null
      }
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

    this.loginState = { username: normalizedUsername, steamId64: parseSteamId64(result.lines) }
    this.lastAuthenticatedState = {
      username: this.loginState.username,
      steamId64: this.loginState.steamId64
    }
    this.emitRunEvent({ runId, ts: Date.now(), type: 'run_finished', phase: 'login' })
    await this.runLogStore.finalize(runId, {
      success: true,
      status: 'success'
    })

    return { sessionId: runId }
  }

  logout(options?: { clearStoredAuth?: boolean }): void {
    const currentState = this.loginState ?? this.lastAuthenticatedState
    this.loginState = null
    if (options?.clearStoredAuth) {
      this.lastAuthenticatedState = null
      if (this.persistentProcess) {
        this.persistentProcess.stdin.write('logout\n')
      }
      return
    }
    if (currentState) {
      this.lastAuthenticatedState = {
        username: currentState.username,
        steamId64: currentState.steamId64
      }
    }
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
    if (mode === 'update') {
      await ensureUpdateContentFolderHasFiles(draft)
    }

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
      const parsedFailure = parseWorkshopRunFailure(commandResult.lines, mode)
      this.emitRunEvent({ runId, ts: Date.now(), type: 'run_failed', phase: mode, errorCode: 'command_failed' })
      await this.runLogStore.finalize(runId, {
        success: false,
        status: 'failed'
      })
      throw new AppError('command_failed', parsedFailure ?? `Workshop ${mode} failed. See run logs for details.`)
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
