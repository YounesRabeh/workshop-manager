/**
 * Overview: Owns SteamCMD child-process lifecycle management for interactive and one-shot runs.
 * Responsibility: Spawns processes with platform-aware options, routes lifecycle callbacks,
 * manages persistent-session invalidation, and writes interactive stdin input.
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import type { SteamCmdPlatformBehavior } from './steamcmd-platform-profile'
import type { SteamCmdSessionState } from './steamcmd-process-session-types'

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
  constructor(private readonly deps: SteamCmdProcessManagerDeps) {}

  hasPersistentProcess(): boolean {
    return this.deps.state.persistentProcess !== null
  }

  getPersistentProcess(): ChildProcessWithoutNullStreams | null {
    return this.deps.state.persistentProcess
  }

  isPersistentPromptReady(): boolean {
    return this.deps.state.persistentPromptReady
  }

  writeInteractiveInput(value: string): void {
    this.deps.state.persistentPromptReady = false
    this.deps.state.persistentProcess?.stdin.write(`${value}${this.deps.platformBehavior.interactiveLineEnding}`)
  }

  spawnOneShot(executablePath: string, args: string[]): ChildProcessWithoutNullStreams {
    return spawn(executablePath, args, this.buildChildProcessOptions())
  }

  async ensurePersistentProcess(
    executablePath?: string,
    startupArgs: string[] = []
  ): Promise<ChildProcessWithoutNullStreams> {
    if (this.deps.state.persistentProcess) {
      return this.deps.state.persistentProcess
    }

    const resolvedExecutablePath = executablePath ?? (await this.deps.steamCmdExecutablePath())
    const child = spawn(resolvedExecutablePath, startupArgs, this.buildChildProcessOptions())
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

  invalidatePersistentSession(): void {
    this.deps.state.persistentProcess = null
    this.deps.state.persistentPromptReady = false
    this.deps.onSessionInvalidated()
  }

  private buildChildProcessOptions() {
    return {
      cwd: this.deps.runtimeDir,
      stdio: 'pipe' as const,
      shell: this.deps.platformBehavior.useShellHost,
      windowsHide: this.deps.platformBehavior.hideWindowsConsole
    }
  }
}

export {
  SteamCmdProcessManager
}
