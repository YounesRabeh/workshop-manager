/**
 * Overview: Orchestrates authenticated SteamCMD runtime workflows for login and workshop operations.
 * Responsibility: Coordinates process sessions, login state, 
 * run events/logging, and delegates command preparation and workshop/profile fetching to specialized services.
 */
import { EventEmitter } from 'node:events'
import { mkdir } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import type {
  RunEvent,
  RunResult,
  SteamProfileSummary,
  UploadDraft,
  WorkshopItemSummary
} from '@shared/contracts'
import {
  DEFAULT_STEAMCMD_TIMEOUT_SETTINGS,
  normalizeSteamCmdTimeoutSettings,
  type SteamCmdTimeoutSettings
} from '@shared/runtime-settings'
import { AppError, isRunCancelledError } from '@backend/utils/errors'
import { RunLogStore } from '@backend/stores/run-log-store'
import {
  isSteamGuardPrompt,
  parseSteamLoginFailure,
  parseWorkshopRunFailure,
  isBenignSteamLatencyWarning,
  isWorkshopSuccessLine,
  extractWorkshopFileIdsFromHtml,
  normalizeWorkshopItems,
  mergeWorkshopItems,
  buildWorkshopArgs,
  isValidSteamId64,
  parsePublishedFileId,
  parseSteamId64,
  steamId64FromAccountId,
  isSteamGuardMobileTimeout,
  stripAnsi
} from './steam-output-parser'
import { SteamCmdProcessSession } from './steamcmd-process-session'
import {
  getSteamCmdPlatformBehavior,
  type SteamCmdPlatformBehavior,
  type SteamCmdPlatformProfile
} from './steamcmd-platform-profile'
import { WorkshopFetchService } from './workshop-fetch-service'
import {
  SteamIdentityResolver
} from './steam-identity-resolver'
import { WorkshopCommandService } from './workshop-command-service'
import type { WorkshopWebApiAccessState } from './workshop-fetch-service'

interface LoginState {
  username: string
  steamId64?: string
}

function createRunId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
}

function resolveLoginTimeoutMs(
  useStoredAuth: boolean,
  settings: SteamCmdTimeoutSettings = DEFAULT_STEAMCMD_TIMEOUT_SETTINGS
): number {
  return useStoredAuth ? settings.storedSessionTimeoutMs : settings.loginTimeoutMs
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return 'unknown error'
}

export {
  buildWorkshopArgs,
  extractWorkshopFileIdsFromHtml,
  isBenignSteamLatencyWarning,
  isValidSteamId64,
  isWorkshopSuccessLine,
  isSteamGuardPrompt,
  mergeWorkshopItems,
  normalizeWorkshopItems,
  parseSteamLoginFailure,
  parseWorkshopRunFailure,
  parseSteamId64,
  resolveLoginTimeoutMs,
  steamId64FromAccountId
}

export class SteamCmdRuntimeService extends EventEmitter {
  private loginState: LoginState | null = null
  private lastAuthenticatedState: LoginState | null = null
  private readonly processSession: SteamCmdProcessSession
  private readonly workshopFetchService: WorkshopFetchService
  private readonly workshopCommandService: WorkshopCommandService
  private readonly steamIdentityResolver: SteamIdentityResolver
  private readonly platformBehavior: SteamCmdPlatformBehavior
  private timeoutSettings = DEFAULT_STEAMCMD_TIMEOUT_SETTINGS

  constructor(
    private readonly steamCmdExecutablePath: () => Promise<string>,
    private readonly runLogStore: RunLogStore,
    private readonly runtimeDir: string,
    platformProfile: SteamCmdPlatformProfile
  ) {
    super()
    this.platformBehavior = getSteamCmdPlatformBehavior(platformProfile)
    this.processSession = new SteamCmdProcessSession({
      steamCmdExecutablePath: this.steamCmdExecutablePath,
      runLogStore: this.runLogStore,
      runtimeDir: this.runtimeDir,
      emitRunEvent: (event) => this.emitRunEvent(event),
      onSessionInvalidated: () => {
        this.loginState = null
      }
    }, platformProfile)
    this.steamIdentityResolver = new SteamIdentityResolver(platformProfile)
    this.workshopFetchService = new WorkshopFetchService({
      getLoginState: () => this.loginState
    })
    this.workshopCommandService = new WorkshopCommandService(this.runtimeDir, platformProfile)
  }

  setTimeoutSettings(settings: SteamCmdTimeoutSettings): void {
    this.timeoutSettings = normalizeSteamCmdTimeoutSettings(settings)
  }

  private emitRunEvent(event: RunEvent): void {
    this.emit('run-event', event)
  }

  private async getSteamIdentityLogPaths(): Promise<string[]> {
    const candidates = [
      join(this.runtimeDir, 'connection_log.txt'),
      join(this.runtimeDir, 'logs', 'connection_log.txt'),
      join(this.runtimeDir, 'Steam', 'logs', 'connection_log.txt')
    ]

    try {
      const executablePath = await this.steamCmdExecutablePath()
      const executableDir = dirname(executablePath)
      candidates.push(
        join(executableDir, 'connection_log.txt'),
        join(executableDir, 'logs', 'connection_log.txt')
      )
    } catch {
      // Ignore executable lookup failures here; the login command already completed.
    }

    return [...new Set(candidates)]
  }

  private async resolveLoginSteamId64(runId: string, username: string, lines: string[]): Promise<string | undefined> {
    const parsedSteamId64 = parseSteamId64(lines)
    if (parsedSteamId64) {
      return parsedSteamId64
    }

    await this.runLogStore.appendLine(
      runId,
      `[RUN_META] no valid steamId64 detected in ${this.platformBehavior.profile} login output`
    )

    await this.runLogStore.appendLine(
      runId,
      '[RUN_META] attempting Steam account identity resolution via SteamCMD connection logs'
    )
    const resolvedFromConnectionLog = await this.steamIdentityResolver.resolveFromConnectionLogs(
      await this.getSteamIdentityLogPaths()
    )
    if (resolvedFromConnectionLog) {
      await this.runLogStore.appendLine(
        runId,
        `[RUN_META] resolved steamId64 via SteamCMD connection log: ${resolvedFromConnectionLog}`
      )
      return resolvedFromConnectionLog
    }

    if (this.platformBehavior.identityResolution !== 'steamcmd_output_then_custom_profile') {
      return undefined
    }

    await this.runLogStore.appendLine(
      runId,
      '[RUN_META] attempting Steam account identity resolution via explicit Steam community profile reference'
    )
    const resolvedSteamId64 = await this.steamIdentityResolver.resolveFromCustomProfile(username)
    if (resolvedSteamId64) {
      await this.runLogStore.appendLine(
        runId,
        `[RUN_META] resolved steamId64 via Steam community profile reference: ${resolvedSteamId64}`
      )
      return resolvedSteamId64
    }

    await this.runLogStore.appendLine(
      runId,
      '[RUN_META] Steam account identity resolution did not return a valid steamId64'
    )
    return undefined
  }

  async login(username: string, password: string, useStoredAuth = false): Promise<{ sessionId: string }> {
    const normalizedUsername = username.trim()
    if (!normalizedUsername) {
      throw new AppError('validation', 'Steam username is required')
    }

    const runId = createRunId()
    const args = this.processSession.buildLoginArgs(normalizedUsername, password, useStoredAuth)
    const timeoutMs = resolveLoginTimeoutMs(useStoredAuth, this.timeoutSettings)

    if (
      useStoredAuth &&
      this.processSession.hasPersistentProcess() &&
      this.lastAuthenticatedState?.username === normalizedUsername &&
      this.processSession.isIdle()
    ) {
      this.loginState = {
        username: this.lastAuthenticatedState.username,
        steamId64: this.lastAuthenticatedState.steamId64
      }
      this.emitRunEvent({ runId, ts: Date.now(), type: 'run_started', phase: 'login' })
      await this.runLogStore.create(runId)
      await this.runLogStore.appendLine(
        runId,
        '[RUN_META] restored active SteamCMD session without re-running login command'
      )
      this.emitRunEvent({ runId, ts: Date.now(), type: 'run_finished', phase: 'login' })
      await this.runLogStore.finalize(runId, {
        success: true,
        status: 'success'
      })
      return { sessionId: runId }
    }

    const result = this.platformBehavior.loginExecution === 'one_shot'
      ? await this.processSession.runOneShot(runId, args, {
          phase: 'login',
          timeoutMs,
          emitOutputEvents: true
        })
      : await this.processSession.run(runId, args, {
          phase: 'login',
          timeoutMs,
          emitOutputEvents: true
        })
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

    const resolvedSteamId64 = await this.resolveLoginSteamId64(runId, normalizedUsername, result.lines)
    this.loginState = { username: normalizedUsername, steamId64: resolvedSteamId64 }
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
      this.processSession.sendLogoutCommand()
      return
    }
    if (currentState) {
      this.lastAuthenticatedState = {
        username: currentState.username,
        steamId64: currentState.steamId64
      }
    }
  }

  async hasStoredAuthFor(username: string | undefined): Promise<boolean> {
    const normalizedUsername = username?.trim()
    if (!normalizedUsername) {
      return false
    }

    const activeUsername = this.loginState?.username?.trim()
    if (activeUsername && activeUsername === normalizedUsername) {
      return true
    }

    const rememberedUsername = this.lastAuthenticatedState?.username?.trim()
    if (
      rememberedUsername &&
      rememberedUsername === normalizedUsername &&
      this.processSession.hasPersistentProcess()
    ) {
      return true
    }

    let executablePath = ''
    try {
      executablePath = await this.steamCmdExecutablePath()
      await mkdir(this.runtimeDir, { recursive: true })
    } catch {
      return false
    }

    const args = ['+login', normalizedUsername, '+quit']

    return await new Promise<boolean>((resolve) => {
      const child = spawn(executablePath, args, {
        cwd: this.runtimeDir,
        stdio: 'pipe',
        shell: this.platformBehavior.useShellHost,
        windowsHide: this.platformBehavior.hideWindowsConsole
      })

      let stdout = ''
      let stderr = ''
      const timeout = setTimeout(() => {
        child.kill('SIGTERM')
        resolve(false)
      }, 6_000)

      const decide = (exitCode: number | null): boolean => {
        const lines = `${stdout}\n${stderr}`
          .split(/\r?\n/)
          .map((line) => stripAnsi(line).trim())
          .filter((line) => line.length > 0)

        const joined = lines.join('\n')

        if (/cached credentials not found|no cached credentials/i.test(joined)) {
          return false
        }
        if (/logging in using cached credentials/i.test(joined)) {
          return true
        }
        if (/waiting for confirmation|steam guard mobile authenticator|auth(?:entication)?\s*code|two-factor/i.test(joined)) {
          return true
        }

        const parsedFailure = parseSteamLoginFailure(lines)
        if (parsedFailure?.code === 'auth') {
          return false
        }

        return exitCode === 0
      }

      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8')
      })
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8')
      })
      child.once('error', () => {
        clearTimeout(timeout)
        resolve(false)
      })
      child.once('close', (exitCode) => {
        clearTimeout(timeout)
        resolve(decide(exitCode))
      })
    })
  }

  async getCurrentProfile(): Promise<SteamProfileSummary> {
    return await this.workshopFetchService.getCurrentProfile()
  }

  async getMyWorkshopItems(
    appId?: string,
    savedWebApiKey?: string,
    options: {
      allowWebApi?: boolean
      webApiAccess?: WorkshopWebApiAccessState
    } = {}
  ): Promise<WorkshopItemSummary[]> {
    return await this.workshopFetchService.getMyWorkshopItems(appId, savedWebApiKey, options)
  }

  submitSteamGuardCode(sessionId: string, code: string): void {
    this.processSession.submitSteamGuardCode(sessionId, code)
  }

  cancelRun(runId: string): void {
    this.processSession.cancelRun(runId)
  }

  private async resolveWorkshopLoginState(): Promise<LoginState> {
    if (this.loginState) {
      return this.loginState
    }

    const rememberedState = this.lastAuthenticatedState
    if (!rememberedState) {
      throw new AppError('auth', 'You must login before uploading or updating mods')
    }

    if (this.platformBehavior.workshopExecution === 'interactive') {
      await this.login(rememberedState.username, '', true)
      if (!this.loginState) {
        throw new AppError('auth', 'Saved Steam session is not available. Enter password to sign in again.')
      }
      return this.loginState
    }

    return rememberedState
  }

  async upload(draft: UploadDraft, mode: 'upload' | 'update' | 'visibility'): Promise<RunResult> {
    const loginState = await this.resolveWorkshopLoginState()
    const prepared = await this.workshopCommandService.prepare(loginState.username, draft, mode)

    this.emitRunEvent({ runId: prepared.runId, ts: Date.now(), type: 'phase_changed', phase: mode })

    let commandResult: { lines: string[]; exitCode: number }
    try {
      commandResult =
        prepared.execution === 'one_shot'
          ? await this.processSession.runOneShot(prepared.runId, prepared.args, {
              phase: mode,
              timeoutMs: this.timeoutSettings.workshopTimeoutMs,
              emitOutputEvents: true
            })
          : await this.processSession.run(prepared.runId, prepared.args, {
              phase: mode,
              timeoutMs: this.timeoutSettings.workshopTimeoutMs,
              emitOutputEvents: true
            })
    } catch (error) {
      const runError =
        error instanceof AppError ? error : new AppError('command_failed', errorMessage(error))
      if (isRunCancelledError(runError)) {
        await this.runLogStore.finalize(prepared.runId, {
          success: false,
          status: 'cancelled'
        })
        throw runError
      }

      this.emitRunEvent({
        runId: prepared.runId,
        ts: Date.now(),
        type: 'run_failed',
        phase: mode,
        errorCode: runError.code
      })
      await this.runLogStore.finalize(prepared.runId, {
        success: false,
        status: 'failed'
      })

      if (runError.code === 'timeout' && mode === 'upload') {
        throw new AppError(
          'timeout',
          `Steam upload timed out after ${Math.round(this.timeoutSettings.workshopTimeoutMs / 1000)}s. Steam may still finish creating the item in the background. Refresh My Workshop Items to confirm.`
        )
      }

      throw runError
    }

    if (commandResult.exitCode !== 0) {
      const parsedFailure = parseWorkshopRunFailure(commandResult.lines, mode)
      this.emitRunEvent({ runId: prepared.runId, ts: Date.now(), type: 'run_failed', phase: mode, errorCode: 'command_failed' })
      await this.runLogStore.finalize(prepared.runId, {
        success: false,
        status: 'failed'
      })
      throw new AppError('command_failed', parsedFailure ?? `Workshop ${mode} failed. See run logs for details.`)
    }

    const publishedFileId = parsePublishedFileId(commandResult.lines) ?? prepared.publishedFileId
    const persisted = await this.runLogStore.finalize(prepared.runId, {
      success: true,
      status: 'success',
      publishedFileId
    })

    const result: RunResult = {
      runId: prepared.runId,
      success: true,
      publishedFileId,
      steamOutputSummary: persisted.steamOutputSummary,
      logPath: persisted.logPath
    }

    this.emitRunEvent({ runId: prepared.runId, ts: Date.now(), type: 'run_finished', phase: mode })
    return result
  }
}

export { errorMessage }
