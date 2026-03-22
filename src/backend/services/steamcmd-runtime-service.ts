/**
 * Overview: Orchestrates authenticated SteamCMD runtime workflows for login and workshop operations.
 * Responsibility: Coordinates process sessions, login state, 
 * run events/logging, and delegates command preparation and workshop/profile fetching to specialized services.
 */
import { EventEmitter } from 'node:events'
import { mkdir } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import type {
  RunEvent,
  RunResult,
  SteamProfileSummary,
  UploadDraft,
  WorkshopItemSummary
} from '@shared/contracts'
import { AppError } from '@backend/utils/errors'
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
  parsePublishedFileId,
  parseSteamId64,
  isSteamGuardMobileTimeout,
  stripAnsi
} from './steam-output-parser'
import { SteamCmdProcessSession } from './steamcmd-process-session'
import { WorkshopFetchService } from './workshop-fetch-service'
import { WorkshopCommandService } from './workshop-command-service'

interface LoginState {
  username: string
  steamId64?: string
}

function createRunId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
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
  isWorkshopSuccessLine,
  isSteamGuardPrompt,
  mergeWorkshopItems,
  normalizeWorkshopItems,
  parseSteamLoginFailure,
  parseWorkshopRunFailure
}

export class SteamCmdRuntimeService extends EventEmitter {
  private loginState: LoginState | null = null
  private lastAuthenticatedState: LoginState | null = null
  private readonly processSession: SteamCmdProcessSession
  private readonly workshopFetchService: WorkshopFetchService
  private readonly workshopCommandService: WorkshopCommandService

  constructor(
    private readonly steamCmdExecutablePath: () => Promise<string>,
    private readonly runLogStore: RunLogStore,
    private readonly runtimeDir: string
  ) {
    super()
    this.processSession = new SteamCmdProcessSession({
      steamCmdExecutablePath: this.steamCmdExecutablePath,
      runLogStore: this.runLogStore,
      runtimeDir: this.runtimeDir,
      emitRunEvent: (event) => this.emitRunEvent(event),
      onSessionInvalidated: () => {
        this.loginState = null
        this.lastAuthenticatedState = null
      }
    })
    this.workshopFetchService = new WorkshopFetchService({
      getLoginState: () => this.loginState
    })
    this.workshopCommandService = new WorkshopCommandService(this.runtimeDir)
  }

  private emitRunEvent(event: RunEvent): void {
    this.emit('run-event', event)
  }

  async login(username: string, password: string, useStoredAuth = false): Promise<{ sessionId: string }> {
    const normalizedUsername = username.trim()
    if (!normalizedUsername) {
      throw new AppError('validation', 'Steam username is required')
    }

    const runId = createRunId()
    const args = this.processSession.buildLoginArgs(normalizedUsername, password, useStoredAuth)
    const timeoutMs = useStoredAuth ? 10_000 : 20_000

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

    const result = await this.processSession.run(runId, args, {
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
    if (rememberedUsername && rememberedUsername === normalizedUsername) {
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
        stdio: 'pipe'
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

  async getMyWorkshopItems(appId?: string, savedWebApiKey?: string, allowWebApi = true): Promise<WorkshopItemSummary[]> {
    return await this.workshopFetchService.getMyWorkshopItems(appId, savedWebApiKey, allowWebApi)
  }

  submitSteamGuardCode(sessionId: string, code: string): void {
    this.processSession.submitSteamGuardCode(sessionId, code)
  }

  cancelRun(runId: string): void {
    this.processSession.cancelRun(runId)
  }

  async upload(draft: UploadDraft, mode: 'upload' | 'update' | 'visibility'): Promise<RunResult> {
    if (!this.loginState) {
      throw new AppError('auth', 'You must login before uploading or updating mods')
    }

    const prepared = await this.workshopCommandService.prepare(this.loginState.username, draft, mode)
    this.emitRunEvent({ runId: prepared.runId, ts: Date.now(), type: 'phase_changed', phase: mode })

    const commandResult = await this.processSession.run(prepared.runId, prepared.args, {
      phase: mode,
      timeoutMs: 10 * 60_000,
      emitOutputEvents: false
    })

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
