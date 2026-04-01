/**
 * Overview: Manages a persistent interactive SteamCMD process for login and workshop commands.
 * Responsibility: Queues runs, parses process output, 
 * handles Steam Guard prompts, emits run events, and records run logs.
 */
import { mkdir } from 'node:fs/promises'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import type { RunEvent } from '@shared/contracts'
import { AppError } from '@backend/utils/errors'
import { RunLogStore } from '@backend/stores/run-log-store'
import {
  buildLoginArgs,
  escapeInteractiveArg,
  isBenignSteamLatencyWarning,
  isLoginSuccessLine,
  isLoginProgressLine,
  isSteamGuardMobilePrompt,
  isSteamGuardMobileTimeout,
  isSteamGuardPrompt,
  isWorkshopSuccessLine,
  parseSteamLoginFailure,
  parseWorkshopRunFailure,
  stripAnsi
} from './steam-output-parser'
import {
  getSteamCmdPlatformBehavior,
  type SteamCmdPlatformBehavior,
  type SteamCmdPlatformProfile
} from './steamcmd-platform-profile'

interface GuardPrompt {
  resolve: (code: string) => void
  reject: (error: Error) => void
}

export interface SessionRunOptions {
  timeoutMs?: number
  phase: RunPhase
  emitOutputEvents?: boolean
  emitRunEvents?: boolean
  persistLogs?: boolean
}

export type RunPhase = 'login' | 'upload' | 'update' | 'visibility'

interface ActiveInteractiveRun {
  runId: string
  phase: RunPhase
  command: string
  commandDispatched: boolean
  waitForPromptBeforeDispatch: boolean
  promptDispatchFallback: ReturnType<typeof setTimeout> | null
  loginProgressRetry: ReturnType<typeof setTimeout> | null
  loginProgressObserved: boolean
  loginDispatchAttempts: number
  emitRunEvents: boolean
  persistLogs: boolean
  writeInput: (value: string) => void
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

interface SteamCmdProcessSessionDeps {
  steamCmdExecutablePath: () => Promise<string>
  runLogStore: RunLogStore
  runtimeDir: string
  emitRunEvent: (event: RunEvent) => void
  onSessionInvalidated: () => void
}

function formatRunMeta(message: string): string {
  return `[RUN_META] ${message}`
}

function isSteamPromptLine(line: string): boolean {
  return /steam>\s*$/i.test(line)
}

export class SteamCmdProcessSession {
  private activeRuns = new Map<string, ChildProcessWithoutNullStreams>()
  private pendingSteamGuard = new Map<string, GuardPrompt>()
  private persistentProcess: ChildProcessWithoutNullStreams | null = null
  private persistentPromptReady = false
  private activeInteractiveRun: ActiveInteractiveRun | null = null
  private commandQueue: Promise<void> = Promise.resolve()
  private stdoutBuffer = ''
  private stderrBuffer = ''
  private readonly platformBehavior: SteamCmdPlatformBehavior

  constructor(
    private readonly deps: SteamCmdProcessSessionDeps,
    platformProfile: SteamCmdPlatformProfile
  ) {
    this.platformBehavior = getSteamCmdPlatformBehavior(platformProfile)
  }

  hasPersistentProcess(): boolean {
    return this.persistentProcess !== null
  }

  isIdle(): boolean {
    return this.activeInteractiveRun === null
  }

  buildLoginArgs(username: string, password: string, useStoredAuth: boolean): string[] {
    return buildLoginArgs(username, password, useStoredAuth)
  }

  private enqueueCommand<T>(task: () => Promise<T>): Promise<T> {
    const next = this.commandQueue.then(task, task)
    this.commandQueue = next.then(
      () => undefined,
      () => undefined
    )
    return next
  }

  private writeInteractiveInput(value: string): void {
    this.persistentPromptReady = false
    this.persistentProcess?.stdin.write(`${value}${this.platformBehavior.interactiveLineEnding}`)
  }

  private dispatchCommandIfReady(activeRun: ActiveInteractiveRun): void {
    if (this.activeInteractiveRun !== activeRun || activeRun.commandDispatched) {
      return
    }
    if (activeRun.promptDispatchFallback) {
      clearTimeout(activeRun.promptDispatchFallback)
      activeRun.promptDispatchFallback = null
    }
    activeRun.commandDispatched = true
    activeRun.loginDispatchAttempts += 1
    this.writeInteractiveInput(activeRun.command)
    this.scheduleLoginProgressRetry(activeRun)
  }

  private scheduleLoginProgressRetry(activeRun: ActiveInteractiveRun): void {
    if (
      this.activeInteractiveRun !== activeRun ||
      activeRun.phase !== 'login' ||
      !this.platformBehavior.enableInteractiveLoginRetry ||
      activeRun.loginProgressObserved ||
      activeRun.loginDispatchAttempts !== 1
    ) {
      return
    }

    if (activeRun.loginProgressRetry) {
      clearTimeout(activeRun.loginProgressRetry)
    }

    activeRun.loginProgressRetry = setTimeout(() => {
      if (
        this.activeInteractiveRun !== activeRun ||
        activeRun.phase !== 'login' ||
        activeRun.loginProgressObserved ||
        activeRun.loginDispatchAttempts !== 1
      ) {
        return
      }

      activeRun.loginDispatchAttempts += 1
      void this.deps.runLogStore
        .appendLine(
          activeRun.runId,
          formatRunMeta('no login progress observed after initial windows-profile dispatch, retrying login command')
        )
        .catch(() => undefined)
      this.writeInteractiveInput(activeRun.command)
    }, 2_500)
  }

  private async ensurePersistentProcess(
    executablePath?: string,
    startupArgs: string[] = []
  ): Promise<ChildProcessWithoutNullStreams> {
    if (this.persistentProcess) {
      return this.persistentProcess
    }

    const resolvedExecutablePath = executablePath ?? (await this.deps.steamCmdExecutablePath())
    const child = spawn(resolvedExecutablePath, startupArgs, {
      cwd: this.deps.runtimeDir,
      stdio: 'pipe',
      shell: this.platformBehavior.useShellHost,
      windowsHide: this.platformBehavior.hideWindowsConsole
    })
    this.persistentProcess = child
    this.persistentPromptReady = false
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
      this.deps.onSessionInvalidated()
    })
    child.once('close', (exitCode) => {
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
      this.persistentPromptReady = false
      this.deps.onSessionInvalidated()
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

  private handleOneShotProcessChunk(
    stream: 'stdout' | 'stderr',
    chunk: Buffer,
    buffers: { stdout: string; stderr: string }
  ): void {
    const incoming = chunk.toString('utf8')
    const key = stream === 'stdout' ? 'stdout' : 'stderr'
    buffers[key] += incoming
    const parts = buffers[key].split(/\r?\n/)
    buffers[key] = parts.pop() ?? ''
    for (const part of parts) {
      this.routeLineToActiveRun(part, stream)
    }
  }

  private routeLineToActiveRun(line: string, type: 'stdout' | 'stderr'): void {
    const normalizedLine = stripAnsi(line).trim()
    if (!normalizedLine) {
      return
    }
    if (isSteamPromptLine(normalizedLine)) {
      this.persistentPromptReady = true
    }

    const activeRun = this.activeInteractiveRun
    if (!activeRun) {
      return
    }

    activeRun.lineQueue = activeRun.lineQueue
      .then(async () => {
        if (activeRun.waitForPromptBeforeDispatch && !activeRun.commandDispatched && isSteamPromptLine(normalizedLine)) {
          this.dispatchCommandIfReady(activeRun)
        }

        if (activeRun.phase === 'login' && isLoginProgressLine(normalizedLine)) {
          activeRun.loginProgressObserved = true
          if (activeRun.loginProgressRetry) {
            clearTimeout(activeRun.loginProgressRetry)
            activeRun.loginProgressRetry = null
          }
        }

        if (activeRun.phase === 'login' && isSteamGuardMobilePrompt(normalizedLine) && !activeRun.guardMobilePromptSent) {
          activeRun.guardMobilePromptSent = true
          if (activeRun.emitRunEvents) {
            this.deps.emitRunEvent({
              runId: activeRun.runId,
              ts: Date.now(),
              type: 'steam_guard_required',
              phase: activeRun.phase,
              promptType: 'steam_guard_mobile'
            })
          }
        }

        if (
          activeRun.phase === 'login' &&
          isSteamGuardPrompt(normalizedLine) &&
          this.pendingSteamGuard.has(activeRun.runId) === false
        ) {
          if (activeRun.emitRunEvents) {
            this.deps.emitRunEvent({
              runId: activeRun.runId,
              ts: Date.now(),
              type: 'steam_guard_required',
              phase: activeRun.phase,
              promptType: 'steam_guard_code'
            })
          }

          const guardPromise = new Promise<string>((guardResolve, guardReject) => {
            this.pendingSteamGuard.set(activeRun.runId, {
              resolve: guardResolve,
              reject: guardReject
            })
          })

          try {
            const guardCode = await guardPromise
            activeRun.writeInput(guardCode)
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
        if (activeRun.persistLogs) {
          void this.deps.runLogStore.appendLine(activeRun.runId, normalizedLine).catch(() => undefined)
        }
        if (activeRun.emitOutputEvents && !isBenignSteamLatencyWarning(normalizedLine)) {
          this.deps.emitRunEvent({
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
    if (activeRun.promptDispatchFallback) {
      clearTimeout(activeRun.promptDispatchFallback)
      activeRun.promptDispatchFallback = null
    }
    if (activeRun.loginProgressRetry) {
      clearTimeout(activeRun.loginProgressRetry)
      activeRun.loginProgressRetry = null
    }
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
    if (activeRun.persistLogs) {
      void this.deps.runLogStore.appendLine(activeRun.runId, meta)
    }

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

  async run(
    runId: string,
    args: string[],
    options: SessionRunOptions
  ): Promise<{ lines: string[]; exitCode: number }> {
    const phase = options.phase as RunPhase
    const timeoutMs = options.timeoutMs ?? 5 * 60_000
    const command = this.buildInteractiveCommand(args, phase)

    return await this.enqueueCommand(async () => {
      const executablePath = await this.deps.steamCmdExecutablePath()
      const waitForPromptBeforeDispatch =
        phase === 'login' &&
        this.persistentProcess === null &&
        this.platformBehavior.waitForPromptBeforeInteractiveLogin
      await mkdir(this.deps.runtimeDir, { recursive: true })
      const persistLogs = options.persistLogs !== false
      const emitRunEvents = options.emitRunEvents !== false
      if (persistLogs) {
        await this.deps.runLogStore.create(runId)
      }
      if (emitRunEvents) {
        this.deps.emitRunEvent({ runId, ts: Date.now(), type: 'run_started', phase })
      }
      await this.ensurePersistentProcess(executablePath)

      if (persistLogs) {
        await this.deps.runLogStore.appendLine(
          runId,
          formatRunMeta(
            `started phase=${phase} timeoutMs=${timeoutMs} executable=${executablePath}`
          )
        )
      }

      return await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          if (persistLogs) {
            this.deps.runLogStore
              .appendLine(runId, formatRunMeta(`timeout reached after ${timeoutMs}ms, restarting SteamCMD process`))
              .catch(() => undefined)
          }
          const activeRun = this.activeInteractiveRun
          if (activeRun?.runId === runId) {
            this.failActiveRun(activeRun, new AppError('timeout', `SteamCMD run exceeded timeout (${timeoutMs}ms)`))
          }
          this.persistentProcess?.kill('SIGTERM')
          this.persistentProcess = null
          this.deps.onSessionInvalidated()
        }, timeoutMs)

        const activeRun: ActiveInteractiveRun = {
          runId,
          phase,
          command,
          commandDispatched: false,
          waitForPromptBeforeDispatch,
          promptDispatchFallback: null,
          loginProgressRetry: null,
          loginProgressObserved: false,
          loginDispatchAttempts: 0,
          emitRunEvents,
          persistLogs,
          writeInput: (value: string) => {
            this.writeInteractiveInput(value)
          },
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
          if (!waitForPromptBeforeDispatch) {
            this.dispatchCommandIfReady(activeRun)
          } else if (this.persistentPromptReady) {
            this.dispatchCommandIfReady(activeRun)
          } else if (this.platformBehavior.enablePromptDispatchFallback) {
            // Wine-hosted Windows console apps may not emit the initial Steam> prompt through pipes.
            activeRun.promptDispatchFallback = setTimeout(() => {
              if (this.activeInteractiveRun !== activeRun || activeRun.commandDispatched) {
                return
              }
              if (persistLogs) {
                void this.deps.runLogStore
                  .appendLine(
                    runId,
                    formatRunMeta('steam prompt not observed promptly on windows profile, dispatching login command anyway')
                  )
                  .catch(() => undefined)
              }
              this.dispatchCommandIfReady(activeRun)
            }, 1_500)
          }
        } else {
          this.failActiveRun(activeRun, new AppError('command_failed', 'SteamCMD process is not available'))
        }
      })
    })
  }

  async runPersistentStartup(
    runId: string,
    startupArgs: string[],
    options: SessionRunOptions
  ): Promise<{ lines: string[]; exitCode: number }> {
    const phase = options.phase as RunPhase
    const timeoutMs = options.timeoutMs ?? 5 * 60_000

    return await this.enqueueCommand(async () => {
      if (this.persistentProcess) {
        throw new AppError('command_failed', 'SteamCMD persistent session is already active')
      }

      const executablePath = await this.deps.steamCmdExecutablePath()
      const persistLogs = options.persistLogs !== false
      const emitRunEvents = options.emitRunEvents !== false

      await mkdir(this.deps.runtimeDir, { recursive: true })
      if (persistLogs) {
        await this.deps.runLogStore.create(runId)
      }
      if (emitRunEvents) {
        this.deps.emitRunEvent({ runId, ts: Date.now(), type: 'run_started', phase })
      }
      if (persistLogs) {
        await this.deps.runLogStore.appendLine(
          runId,
          formatRunMeta(
            `started phase=${phase} timeoutMs=${timeoutMs} executable=${executablePath} mode=persistent-startup`
          )
        )
      }

      return await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          if (persistLogs) {
            this.deps.runLogStore
              .appendLine(
                runId,
                formatRunMeta(`timeout reached after ${timeoutMs}ms, terminating persistent SteamCMD startup`)
              )
              .catch(() => undefined)
          }

          const activeRun = this.activeInteractiveRun
          if (activeRun?.runId === runId) {
            this.failActiveRun(activeRun, new AppError('timeout', `SteamCMD run exceeded timeout (${timeoutMs}ms)`))
          }
          this.persistentProcess?.kill('SIGTERM')
          this.persistentProcess = null
          this.persistentPromptReady = false
          this.deps.onSessionInvalidated()
        }, timeoutMs)

        const activeRun: ActiveInteractiveRun = {
          runId,
          phase,
          command: startupArgs.join(' '),
          commandDispatched: true,
          waitForPromptBeforeDispatch: false,
          promptDispatchFallback: null,
          loginProgressRetry: null,
          loginProgressObserved: false,
          loginDispatchAttempts: 0,
          emitRunEvents,
          persistLogs,
          writeInput: (value: string) => {
            this.writeInteractiveInput(value)
          },
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

        void this.ensurePersistentProcess(executablePath, startupArgs)
          .then((child) => {
            this.activeRuns.set(runId, child)
          })
          .catch((error: unknown) => {
            this.failActiveRun(
              activeRun,
              error instanceof AppError
                ? error
                : new AppError('command_failed', error instanceof Error ? error.message : 'SteamCMD spawn failed')
            )
          })
      })
    })
  }

  async runOneShot(
    runId: string,
    args: string[],
    options: SessionRunOptions
  ): Promise<{ lines: string[]; exitCode: number }> {
    const phase = options.phase as RunPhase
    const timeoutMs = options.timeoutMs ?? 5 * 60_000

    return await this.enqueueCommand(async () => {
      const executablePath = await this.deps.steamCmdExecutablePath()
      const persistLogs = options.persistLogs !== false
      const emitRunEvents = options.emitRunEvents !== false

      await mkdir(this.deps.runtimeDir, { recursive: true })
      if (persistLogs) {
        await this.deps.runLogStore.create(runId)
      }
      if (emitRunEvents) {
        this.deps.emitRunEvent({ runId, ts: Date.now(), type: 'run_started', phase })
      }
      if (persistLogs) {
        await this.deps.runLogStore.appendLine(
          runId,
          formatRunMeta(
            `started phase=${phase} timeoutMs=${timeoutMs} executable=${executablePath} mode=oneshot`
          )
        )
      }

      return await new Promise((resolve, reject) => {
        const child = spawn(executablePath, args, {
          cwd: this.deps.runtimeDir,
          stdio: 'pipe',
          shell: this.platformBehavior.useShellHost,
          windowsHide: this.platformBehavior.hideWindowsConsole
        })
        const buffers = { stdout: '', stderr: '' }
        const timeout = setTimeout(() => {
          if (persistLogs) {
            this.deps.runLogStore
              .appendLine(runId, formatRunMeta(`timeout reached after ${timeoutMs}ms, terminating one-shot SteamCMD process`))
              .catch(() => undefined)
          }
          const activeRun = this.activeInteractiveRun
          if (activeRun?.runId === runId) {
            this.failActiveRun(activeRun, new AppError('timeout', `SteamCMD run exceeded timeout (${timeoutMs}ms)`))
          }
          child.kill('SIGTERM')
        }, timeoutMs)

        const activeRun: ActiveInteractiveRun = {
          runId,
          phase,
          command: args.join(' '),
          commandDispatched: true,
          waitForPromptBeforeDispatch: false,
          promptDispatchFallback: null,
          loginProgressRetry: null,
          loginProgressObserved: false,
          loginDispatchAttempts: 0,
          emitRunEvents,
          persistLogs,
          writeInput: (value: string) => {
            child.stdin.write(`${value}${this.platformBehavior.interactiveLineEnding}`)
          },
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
        this.activeRuns.set(runId, child)

        child.stdout.on('data', (chunk: Buffer) => {
          this.handleOneShotProcessChunk('stdout', chunk, buffers)
        })
        child.stderr.on('data', (chunk: Buffer) => {
          this.handleOneShotProcessChunk('stderr', chunk, buffers)
        })
        child.once('error', (error) => {
          this.failActiveRun(activeRun, new AppError('command_failed', `SteamCMD spawn failed: ${error.message}`))
        })
        child.once('close', (exitCode) => {
          const trailingStdout = buffers.stdout.trim()
          const trailingStderr = buffers.stderr.trim()
          buffers.stdout = ''
          buffers.stderr = ''
          if (trailingStdout.length > 0) {
            this.routeLineToActiveRun(trailingStdout, 'stdout')
          }
          if (trailingStderr.length > 0) {
            this.routeLineToActiveRun(trailingStderr, 'stderr')
          }

          this.activeRuns.delete(runId)
          if (this.activeInteractiveRun !== activeRun) {
            return
          }

          void activeRun.lineQueue.finally(() => {
            if (this.activeInteractiveRun !== activeRun) {
              return
            }

            if (!activeRun.pendingResult) {
              const parsedLoginFailure = phase === 'login' ? parseSteamLoginFailure(activeRun.lines) : undefined
              if (parsedLoginFailure) {
                activeRun.pendingResult = { exitCode: 1 }
              } else if (phase === 'login' && activeRun.lines.some((line) => isLoginSuccessLine(line))) {
                activeRun.pendingResult = { exitCode: exitCode ?? 0 }
              } else if ((exitCode ?? 1) !== 0) {
                activeRun.pendingResult = {
                  exitCode: exitCode ?? 1,
                  runtimeError: new AppError('command_failed', `SteamCMD process exited unexpectedly (code ${exitCode ?? 1})`)
                }
              } else {
                activeRun.pendingResult = {
                  exitCode: 1,
                  runtimeError: new AppError('auth', 'Steam login failed. Check credentials or guard method.')
                }
              }
            }

            this.finishActiveRun(activeRun)
          })
        })
      })
    })
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
    this.deps.emitRunEvent({ runId, ts: Date.now(), type: 'run_cancelled', phase: 'cancelled' })
  }

  sendLogoutCommand(): void {
    if (this.persistentProcess) {
      this.writeInteractiveInput('logout')
    }
  }
}
