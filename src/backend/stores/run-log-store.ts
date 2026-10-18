/**
 * Overview: Maintains in-memory run log state and persists session output to disk.
 * Responsibility: Creates run records, batches/appends live output, finalizes run status, and exposes run retrieval/listing APIs.
 */
import { appendFile, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { PersistedRunLog } from '@shared/contracts'

const SESSION_LOG_FILE = 'steamcmd-output.log'
const FLUSH_INTERVAL_MS = 120
const FLUSH_BATCH_SIZE = 24

/** Creates an independent copy of log. */
function cloneLog(log: PersistedRunLog): PersistedRunLog {
  return {
    ...log,
    lines: [...log.lines]
  }
}

export class RunLogStore {
  private writeChain: Promise<void> = Promise.resolve()
  private runs = new Map<string, PersistedRunLog>()
  private pendingLines: string[] = []
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private backgroundFlush: Promise<void> | null = null
  private backgroundFlushError: unknown = null

  /** Sets the directory where the current SteamCMD session log is persisted. */
  constructor(private readonly logsDir: string) {}

  /** Resolves the path of the session's SteamCMD output log. */
  private getSessionLogPath(): string {
    return join(this.logsDir, SESSION_LOG_FILE)
  }

  /** Queues database writes so concurrent read-modify-write operations cannot overwrite one another. */
  private async withWriteLock(operation: () => Promise<void>): Promise<void> {
    const next = this.writeChain.then(operation)
    this.writeChain = next.catch(() => undefined)
    await next
  }

  /** Starts a new run record and clears the previous session log. */
  async create(runId: string): Promise<PersistedRunLog> {
    await this.waitForBackgroundFlush()
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
      if (this.flushTimer) {
        clearTimeout(this.flushTimer)
        this.flushTimer = null
      }
      this.pendingLines = []
      this.runs.clear()
      this.runs.set(runId, log)
    })

    return cloneLog(log)
  }

  /** Adds output to the in-memory run record and queues it for disk persistence. */
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
    this.runs.set(runId, current)
    this.pendingLines.push(line)

    if (this.pendingLines.length >= FLUSH_BATCH_SIZE) {
      this.startBackgroundFlush()
      return
    }

    this.scheduleFlush()
  }

  /** Adds a diagnostic line to the current run log without changing its final result. */
  async appendDiagnosticLine(line: string): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
    await this.waitForBackgroundFlush()
    await this.flushPendingLines()

    for (const current of this.runs.values()) {
      current.lines.push(line)
      current.steamOutputSummary = current.lines.slice(-25).join('\n')
    }

    await this.withWriteLock(async () => {
      await mkdir(this.logsDir, { recursive: true })
      await appendFile(this.getSessionLogPath(), `${line}\n`, 'utf8')
    })
  }

  /** Records the final outcome of operation and releases its active state. */
  async finalize(runId: string, update: Partial<PersistedRunLog>): Promise<PersistedRunLog> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
    await this.waitForBackgroundFlush()
    await this.flushPendingLines()

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
      this.runs.set(runId, merged)
      const output = merged.lines.length > 0 ? `${merged.lines.join('\n')}\n` : ''
      await writeFile(this.getSessionLogPath(), output, 'utf8')
    })
    return cloneLog(merged)
  }

  /** Returns the operation. */
  async get(runId: string): Promise<PersistedRunLog | null> {
    const found = this.runs.get(runId)
    return found ? cloneLog(found) : null
  }

  /** Returns cloned run records ordered from newest run ID to oldest. */
  async list(): Promise<PersistedRunLog[]> {
    return [...this.runs.values()]
      .sort((a, b) => b.runId.localeCompare(a.runId))
      .map((entry) => cloneLog(entry))
  }

  /** Starts a delayed disk flush so individual log lines can be batched. */
  private scheduleFlush(): void {
    if (this.flushTimer) {
      return
    }
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null
      this.startBackgroundFlush()
    }, FLUSH_INTERVAL_MS)
  }

  /** Starts background flush and initializes its associated state. */
  private startBackgroundFlush(): void {
    if (this.backgroundFlush) {
      return
    }
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
    this.backgroundFlush = this.flushPendingLines()
      .catch((error: unknown) => {
        this.backgroundFlushError ??= error
      })
      .finally(() => {
        this.backgroundFlush = null
        if (this.backgroundFlushError || this.pendingLines.length === 0) {
          return
        }
        if (this.pendingLines.length >= FLUSH_BATCH_SIZE) {
          this.startBackgroundFlush()
          return
        }
        this.scheduleFlush()
      })
  }

  /** Waits for for background flush to finish before proceeding. */
  private async waitForBackgroundFlush(): Promise<void> {
    await this.backgroundFlush
    if (this.backgroundFlushError) {
      const error = this.backgroundFlushError
      this.backgroundFlushError = null
      throw error
    }
  }

  /** Writes buffered pending lines to its destination. */
  private async flushPendingLines(): Promise<void> {
    if (this.pendingLines.length === 0) {
      return
    }

    const lines = this.pendingLines
    this.pendingLines = []
    const content = `${lines.join('\n')}\n`
    try {
      await this.withWriteLock(async () => {
        await appendFile(this.getSessionLogPath(), content, 'utf8')
      })
    } catch (error) {
      this.pendingLines = [...lines, ...this.pendingLines]
      throw error
    }
  }
}
