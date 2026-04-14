/**
 * Overview: Coordinates persistent and one-shot SteamCMD runs for login and workshop phases.
 * Responsibility: Keeps high-level run orchestration while delegating process lifecycle,
 * run setup, output parsing, and logging/event behavior to focused helper modules.
 */
import { AppError, RunCancelledError } from '@backend/utils/errors'
import { buildLoginArgs } from './steam-output-parser'
import {
  getSteamCmdPlatformBehavior,
  type SteamCmdPlatformBehavior,
  type SteamCmdPlatformProfile
} from './steamcmd-platform-profile'
import { SteamCmdLogger } from './SteamCmdLogger'
import { SteamCmdOutputProcessor } from './SteamCmdOutputProcessor'
import { SteamCmdProcessManager } from './SteamCmdProcessManager'
import { SteamCmdRunHandler } from './SteamCmdRunHandler'
import type {
  ActiveInteractiveRun,
  RunPhase,
  SessionRunOptions,
  SteamCmdProcessSessionDeps,
  SteamCmdSessionState
} from './steamcmd-process-session-types'

export type {
  RunPhase,
  SessionRunOptions
} from './steamcmd-process-session-types'

export class SteamCmdProcessSession {
  private readonly state: SteamCmdSessionState = {
    activeRuns: new Map(),
    pendingSteamGuard: new Map(),
    persistentProcess: null,
    persistentPromptReady: false,
    activeInteractiveRun: null,
    commandQueue: Promise.resolve()
  }

  private readonly platformBehavior: SteamCmdPlatformBehavior
  private readonly logger: SteamCmdLogger
  private readonly runHandler: SteamCmdRunHandler
  private readonly outputProcessor: SteamCmdOutputProcessor
  private readonly processManager: SteamCmdProcessManager

  constructor(
    private readonly deps: SteamCmdProcessSessionDeps,
    platformProfile: SteamCmdPlatformProfile
  ) {
    this.platformBehavior = getSteamCmdPlatformBehavior(platformProfile)
    this.logger = new SteamCmdLogger(this.deps.runLogStore, this.deps.emitRunEvent)
    this.runHandler = new SteamCmdRunHandler({
      state: this.state,
      steamCmdExecutablePath: this.deps.steamCmdExecutablePath,
      runtimeDir: this.deps.runtimeDir,
      platformBehavior: this.platformBehavior,
      logger: this.logger
    })

    this.outputProcessor = new SteamCmdOutputProcessor({
      state: this.state,
      logger: this.logger,
      onDispatchCommandIfReady: (activeRun) => {
        this.runHandler.dispatchCommandIfReady(activeRun, (value: string) => {
          this.processManager.writeInteractiveInput(value)
        })
      },
      onFailActiveRun: (activeRun, error) => {
        this.failActiveRun(activeRun, error)
      },
      onScheduleActiveRunSettle: (activeRun) => {
        this.scheduleActiveRunSettle(activeRun)
      }
    })

    this.processManager = new SteamCmdProcessManager({
      state: this.state,
      steamCmdExecutablePath: this.deps.steamCmdExecutablePath,
      runtimeDir: this.deps.runtimeDir,
      platformBehavior: this.platformBehavior,
      onPersistentChunk: (stream, chunk) => {
        this.outputProcessor.handlePersistentChunk(stream, chunk)
      },
      onPersistentError: (error) => {
        const activeRun = this.state.activeInteractiveRun
        if (activeRun) {
          this.failActiveRun(activeRun, new AppError('command_failed', `SteamCMD spawn failed: ${error.message}`))
        }
      },
      onPersistentClose: (exitCode) => {
        this.outputProcessor.flushPersistentTrailingLines()
        const activeRun = this.state.activeInteractiveRun
        if (activeRun) {
          this.failActiveRun(
            activeRun,
            new AppError('command_failed', `SteamCMD process exited unexpectedly (code ${exitCode ?? 1})`)
          )
        }
      },
      onSessionInvalidated: () => {
        this.deps.onSessionInvalidated()
      }
    })
  }

  hasPersistentProcess(): boolean {
    return this.processManager.hasPersistentProcess()
  }

  isIdle(): boolean {
    return this.state.activeInteractiveRun === null
  }

  buildLoginArgs(username: string, password: string, useStoredAuth: boolean): string[] {
    return buildLoginArgs(username, password, useStoredAuth)
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
    if (this.state.activeInteractiveRun !== activeRun) {
      return
    }

    this.state.activeInteractiveRun = null
    this.state.activeRuns.delete(activeRun.runId)
    if (activeRun.timeout) {
      clearTimeout(activeRun.timeout)
    }
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
        ? this.logger.formatRunMeta(
            `command finished phase=${activeRun.phase} exitCode=${pending.exitCode} error=${pending.runtimeError.message}`
          )
        : this.logger.formatRunMeta(`command finished phase=${activeRun.phase} exitCode=${pending.exitCode}`)
    if (activeRun.persistLogs) {
      this.logger.appendLineNoThrow(activeRun.runId, meta)
    }

    if (pending.runtimeError) {
      activeRun.reject(pending.runtimeError)
      return
    }

    activeRun.resolve({ lines: activeRun.lines, exitCode: pending.exitCode })
  }

  private rejectPendingSteamGuard(runId: string, error: Error): void {
    const pending = this.state.pendingSteamGuard.get(runId)
    if (!pending) {
      return
    }

    this.state.pendingSteamGuard.delete(runId)
    pending.reject(error)
  }

  private failActiveRun(activeRun: ActiveInteractiveRun, error: Error): void {
    if (this.state.activeInteractiveRun !== activeRun) {
      return
    }
    const normalizedError =
      error instanceof AppError ? error : new AppError('command_failed', error.message)
    this.rejectPendingSteamGuard(activeRun.runId, normalizedError)
    activeRun.pendingResult = {
      exitCode: 1,
      runtimeError: normalizedError
    }
    this.finishActiveRun(activeRun)
  }

  async run(
    runId: string,
    args: string[],
    options: SessionRunOptions
  ): Promise<{ lines: string[]; exitCode: number }> {
    const phase = options.phase as RunPhase
    const command = this.runHandler.buildInteractiveCommand(args, phase)

    return await this.runHandler.enqueueCommand(async () => {
      const context = await this.runHandler.prepareRunContext(runId, options)
      const waitForPromptBeforeDispatch =
        phase === 'login' &&
        !this.processManager.hasPersistentProcess() &&
        this.platformBehavior.waitForPromptBeforeInteractiveLogin
      await this.processManager.ensurePersistentProcess(context.executablePath)

      return await new Promise((resolve, reject) => {
        const timeout = this.runHandler.createRunTimeout(
          runId,
          context.timeoutMs,
          context.persistLogs,
          `timeout reached after ${context.timeoutMs}ms, restarting SteamCMD process`,
          () => {
            const activeRun = this.state.activeInteractiveRun
            if (activeRun?.runId === runId) {
              this.failActiveRun(activeRun, new AppError('timeout', `SteamCMD run exceeded timeout (${context.timeoutMs}ms)`))
            }
            this.processManager.getPersistentProcess()?.kill('SIGTERM')
            this.processManager.invalidatePersistentSession()
          },
        )

        const activeRun = this.runHandler.createActiveRun({
          runId,
          phase,
          command,
          emitRunEvents: context.emitRunEvents,
          persistLogs: context.persistLogs,
          emitOutputEvents: options.emitOutputEvents === true,
          timeout,
          writeInput: (value: string) => {
            this.processManager.writeInteractiveInput(value)
          },
          resolve,
          reject,
          waitForPromptBeforeDispatch
        })

        this.state.activeInteractiveRun = activeRun
        const persistentProcess = this.processManager.getPersistentProcess()
        if (persistentProcess) {
          this.state.activeRuns.set(runId, persistentProcess)
          if (!waitForPromptBeforeDispatch) {
            this.runHandler.dispatchCommandIfReady(activeRun, (value: string) => {
              this.processManager.writeInteractiveInput(value)
            })
          } else if (this.processManager.isPersistentPromptReady()) {
            this.runHandler.dispatchCommandIfReady(activeRun, (value: string) => {
              this.processManager.writeInteractiveInput(value)
            })
          } else if (this.platformBehavior.enablePromptDispatchFallback) {
            // Wine-hosted Windows console apps may not emit the initial Steam> prompt through pipes.
            activeRun.promptDispatchFallback = setTimeout(() => {
              if (this.state.activeInteractiveRun !== activeRun || activeRun.commandDispatched) {
                return
              }
              if (context.persistLogs) {
                this.logger.appendLineNoThrow(
                  runId,
                  this.logger.formatRunMeta('steam prompt not observed promptly on windows profile, dispatching login command anyway')
                )
              }
              this.runHandler.dispatchCommandIfReady(activeRun, (value: string) => {
                this.processManager.writeInteractiveInput(value)
              })
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

    return await this.runHandler.enqueueCommand(async () => {
      if (this.processManager.hasPersistentProcess()) {
        throw new AppError('command_failed', 'SteamCMD persistent session is already active')
      }

      const context = await this.runHandler.prepareRunContext(runId, options, 'mode=persistent-startup')

      return await new Promise((resolve, reject) => {
        const timeout = this.runHandler.createRunTimeout(
          runId,
          context.timeoutMs,
          context.persistLogs,
          `timeout reached after ${context.timeoutMs}ms, terminating persistent SteamCMD startup`,
          () => {
            const activeRun = this.state.activeInteractiveRun
            if (activeRun?.runId === runId) {
              this.failActiveRun(activeRun, new AppError('timeout', `SteamCMD run exceeded timeout (${context.timeoutMs}ms)`))
            }
            this.processManager.getPersistentProcess()?.kill('SIGTERM')
            this.processManager.invalidatePersistentSession()
          }
        )

        const activeRun = this.runHandler.createActiveRun({
          runId,
          phase,
          command: startupArgs.join(' '),
          emitRunEvents: context.emitRunEvents,
          persistLogs: context.persistLogs,
          emitOutputEvents: options.emitOutputEvents === true,
          timeout,
          writeInput: (value: string) => {
            this.processManager.writeInteractiveInput(value)
          },
          resolve,
          reject,
          commandDispatched: true
        })

        this.state.activeInteractiveRun = activeRun

        void this.processManager.ensurePersistentProcess(context.executablePath, startupArgs)
          .then((child) => {
            this.state.activeRuns.set(runId, child)
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

    return await this.runHandler.enqueueCommand(async () => {
      const context = await this.runHandler.prepareRunContext(runId, options, 'mode=oneshot')

      return await new Promise((resolve, reject) => {
        const child = this.processManager.spawnOneShot(context.executablePath, args)
        const buffers = this.outputProcessor.createOneShotBuffers()
        const timeout = this.runHandler.createRunTimeout(
          runId,
          context.timeoutMs,
          context.persistLogs,
          `timeout reached after ${context.timeoutMs}ms, terminating one-shot SteamCMD process`,
          () => {
            const activeRun = this.state.activeInteractiveRun
            if (activeRun?.runId === runId) {
              this.failActiveRun(activeRun, new AppError('timeout', `SteamCMD run exceeded timeout (${context.timeoutMs}ms)`))
            }
            child.kill('SIGTERM')
          }
        )

        const activeRun = this.runHandler.createActiveRun({
          runId,
          phase,
          command: args.join(' '),
          emitRunEvents: context.emitRunEvents,
          persistLogs: context.persistLogs,
          emitOutputEvents: options.emitOutputEvents === true,
          timeout,
          writeInput: (value: string) => {
            child.stdin.write(`${value}${this.platformBehavior.interactiveLineEnding}`)
          },
          resolve,
          reject,
          commandDispatched: true
        })

        this.state.activeInteractiveRun = activeRun
        this.state.activeRuns.set(runId, child)

        child.stdout.on('data', (chunk: Buffer) => {
          this.outputProcessor.handleOneShotProcessChunk('stdout', chunk, buffers)
        })
        child.stderr.on('data', (chunk: Buffer) => {
          this.outputProcessor.handleOneShotProcessChunk('stderr', chunk, buffers)
        })
        child.once('error', (error) => {
          this.failActiveRun(activeRun, new AppError('command_failed', `SteamCMD spawn failed: ${error.message}`))
        })
        child.once('close', (exitCode) => {
          this.outputProcessor.flushOneShotTrailingLines(buffers)

          this.state.activeRuns.delete(runId)
          if (this.state.activeInteractiveRun !== activeRun) {
            return
          }

          void activeRun.lineQueue.finally(() => {
            if (this.state.activeInteractiveRun !== activeRun) {
              return
            }

            if (!activeRun.pendingResult) {
              activeRun.pendingResult = this.outputProcessor.deriveOneShotPendingResult(phase, activeRun.lines, exitCode)
            }

            this.finishActiveRun(activeRun)
          })
        })
      })
    })
  }

  submitSteamGuardCode(sessionId: string, code: string): void {
    process.stderr.write(
      `[TEMP OTP] submitSteamGuardCode called ${JSON.stringify({
        sessionId,
        codeLength: code.trim().length,
        pendingPromptExists: this.state.pendingSteamGuard.has(sessionId),
        pendingPromptCount: this.state.pendingSteamGuard.size
      })}\n`
    )
    const pending = this.state.pendingSteamGuard.get(sessionId)
    if (!pending) {
      process.stderr.write(
        `[TEMP OTP] submitSteamGuardCode rejected: no pending prompt for session ${JSON.stringify({
          sessionId
        })}\n`
      )
      throw new AppError('steam_guard', 'No Steam Guard prompt is currently waiting for this session')
    }
    process.stderr.write(
      `[TEMP OTP] submitSteamGuardCode resolving pending prompt ${JSON.stringify({
        sessionId
      })}\n`
    )
    pending.resolve(code.trim())
  }

  cancelRun(runId: string): void {
    const processHandle = this.state.activeRuns.get(runId)
    if (!processHandle) {
      return
    }

    const activeRun = this.state.activeInteractiveRun?.runId === runId ? this.state.activeInteractiveRun : null
    if (activeRun) {
      const cancelError = new RunCancelledError()
      this.rejectPendingSteamGuard(runId, cancelError)
      activeRun.pendingResult = {
        exitCode: 1,
        runtimeError: cancelError
      }
      this.finishActiveRun(activeRun)
    }

    processHandle.kill('SIGTERM')
    this.logger.emit({ runId, ts: Date.now(), type: 'run_cancelled', phase: 'cancelled' })
  }

  sendLogoutCommand(): void {
    if (this.processManager.hasPersistentProcess()) {
      this.processManager.writeInteractiveInput('logout')
    }
  }

  resetPersistentSession(): void {
    const persistentProcess = this.processManager.getPersistentProcess()
    if (!persistentProcess) {
      return
    }

    persistentProcess.kill('SIGTERM')
    this.processManager.invalidatePersistentSession()
  }
}
