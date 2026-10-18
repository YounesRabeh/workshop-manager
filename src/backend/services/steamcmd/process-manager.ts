/**
 * Domain: SteamCMD execution.
 * Overview: Owns SteamCMD child-process lifecycle management for interactive and one-shot runs.
 * Responsibility: Spawns processes with platform-aware options, routes lifecycle callbacks,
 * manages persistent-session invalidation, and writes interactive stdin input.
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { buildSteamCmdLaunchArgs } from '@shared/build-config'
import type { SteamCmdPlatformBehavior } from './platform-profile'
import type { SteamCmdSessionState } from './process-session-types'

interface SteamCmdProcessManagerDeps {
  state: SteamCmdSessionState
  steamCmdExecutablePath: () => Promise<string>
  runtimeDir: string
  platformBehavior: SteamCmdPlatformBehavior
  onPersistentChunk: (stream: 'stdout' | 'stderr', chunk: Buffer) => void
  onPersistentError: (error: Error) => void
  onPersistentClose: (exitCode: number | null) => void
  onSessionInvalidated: () => void
}

class SteamCmdProcessManager {
  /** Stores the executable, arguments, and callbacks used to launch SteamCMD. */
  constructor(private readonly deps: SteamCmdProcessManagerDeps) {}

  /** Adds SteamCMD-specific settings to the child process environment. */
  private buildChildProcessEnv(): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { ...process.env }
    if (this.deps.platformBehavior.profile === 'linux') {
      const isolatedHome = this.deps.runtimeDir
      env.HOME = isolatedHome
      env.XDG_CONFIG_HOME = isolatedHome
      env.XDG_DATA_HOME = isolatedHome
      env.XDG_CACHE_HOME = `${isolatedHome}/.cache`
    }
    return env
  }

  /** Returns true when the persistent process is available. */
  hasPersistentProcess(): boolean {
    return this.deps.state.persistentProcess !== null
  }

  /** Returns the persistent process. */
  getPersistentProcess(): ChildProcessWithoutNullStreams | null {
    return this.deps.state.persistentProcess
  }

  /** Checks whether output contains the prompt that makes the persistent process ready. */
  isPersistentPromptReady(): boolean {
    return this.deps.state.persistentPromptReady
  }

  /** Sends a response to the running SteamCMD process. */
  writeInteractiveInput(value: string): void {
    this.deps.state.persistentPromptReady = false
    this.deps.state.persistentProcess?.stdin.write(`${value}${this.deps.platformBehavior.interactiveLineEnding}`)
  }

  /** Starts one shot with the configured executable and arguments. */
  spawnOneShot(executablePath: string, args: string[]): ChildProcessWithoutNullStreams {
    return spawn(executablePath, buildSteamCmdLaunchArgs(args), this.buildChildProcessOptions())
  }

  /** Reuses the persistent process or starts it when none is available. */
  async ensurePersistentProcess(
    executablePath?: string,
    startupArgs: string[] = []
  ): Promise<ChildProcessWithoutNullStreams> {
    if (this.deps.state.persistentProcess) {
      return this.deps.state.persistentProcess
    }

    const resolvedExecutablePath = executablePath ?? (await this.deps.steamCmdExecutablePath())
    const child = spawn(
      resolvedExecutablePath,
      buildSteamCmdLaunchArgs(startupArgs),
      this.buildChildProcessOptions()
    )
    this.deps.state.persistentProcess = child
    this.deps.state.persistentPromptReady = false

    child.stdout.on('data', (chunk: Buffer) => {
      this.deps.onPersistentChunk('stdout', chunk)
    })
    child.stderr.on('data', (chunk: Buffer) => {
      this.deps.onPersistentChunk('stderr', chunk)
    })
    child.once('error', (error) => {
      this.deps.onPersistentError(error)
      this.invalidatePersistentSession()
    })
    child.once('close', (exitCode) => {
      this.deps.onPersistentClose(exitCode)
      this.invalidatePersistentSession()
    })

    return child
  }

  /** Marks persistent session unusable so it will be recreated before the next run. */
  invalidatePersistentSession(): void {
    this.deps.state.persistentProcess = null
    this.deps.state.persistentPromptReady = false
    this.deps.onSessionInvalidated()
  }

  /** Builds spawn options, including the platform-specific executable and environment. */
  private buildChildProcessOptions() {
    return {
      cwd: this.deps.runtimeDir,
      stdio: 'pipe' as const,
      shell: this.deps.platformBehavior.useShellHost,
      windowsHide: this.deps.platformBehavior.hideWindowsConsole,
      env: this.buildChildProcessEnv()
    }
  }
}

export {
  SteamCmdProcessManager
}
