import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { RunResult } from '@shared/contracts'

export interface PersistedRunLog extends RunResult {
  lines: string[]
  status: 'running' | 'success' | 'failed' | 'cancelled'
}

const SESSION_LOG_FILE = 'steamcmd-output.log'

function cloneLog(log: PersistedRunLog): PersistedRunLog {
  return {
    ...log,
    lines: [...log.lines]
  }
}

export class RunLogStore {
  private writeChain: Promise<void> = Promise.resolve()
  private runs = new Map<string, PersistedRunLog>()

  constructor(private readonly logsDir: string) {}

  private getSessionLogPath(): string {
    return join(this.logsDir, SESSION_LOG_FILE)
  }

  private async withWriteLock(operation: () => Promise<void>): Promise<void> {
    const next = this.writeChain.then(operation)
    this.writeChain = next.catch(() => undefined)
    await next
  }

  async create(runId: string): Promise<PersistedRunLog> {
    const log: PersistedRunLog = {
      runId,
      success: false,
      steamOutputSummary: '',
      logPath: this.getSessionLogPath(),
      lines: [],
      status: 'running'
    }

    await this.withWriteLock(async () => {
      await mkdir(this.logsDir, { recursive: true })
      // Requested behavior: keep only current session output.
      await writeFile(this.getSessionLogPath(), '', 'utf8')
      this.runs.clear()
      this.runs.set(runId, cloneLog(log))
    })

    return cloneLog(log)
  }

  async appendLine(runId: string, line: string): Promise<void> {
    const current = this.runs.get(runId) ?? {
      runId,
      success: false,
      steamOutputSummary: '',
      logPath: this.getSessionLogPath(),
      lines: [],
      status: 'running' as const
    }

    current.lines.push(line)
    current.steamOutputSummary = current.lines.slice(-25).join('\n')
    this.runs.set(runId, cloneLog(current))
  }

  async finalize(runId: string, update: Partial<PersistedRunLog>): Promise<PersistedRunLog> {
    let merged!: PersistedRunLog
    await this.withWriteLock(async () => {
      const current = this.runs.get(runId) ?? {
        runId,
        success: false,
        steamOutputSummary: '',
        logPath: this.getSessionLogPath(),
        lines: [],
        status: 'running' as const
      }

      merged = {
        ...current,
        ...update,
        runId,
        logPath: this.getSessionLogPath()
      }
      this.runs.set(runId, cloneLog(merged))
      const output = merged.lines.length > 0 ? `${merged.lines.join('\n')}\n` : ''
      await writeFile(this.getSessionLogPath(), output, 'utf8')
    })
    return cloneLog(merged)
  }

  async get(runId: string): Promise<PersistedRunLog | null> {
    const found = this.runs.get(runId)
    return found ? cloneLog(found) : null
  }

  async list(): Promise<PersistedRunLog[]> {
    return [...this.runs.values()]
      .sort((a, b) => b.runId.localeCompare(a.runId))
      .map((entry) => cloneLog(entry))
  }
}
