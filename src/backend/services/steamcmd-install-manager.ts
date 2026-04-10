/**
 * Overview: Resolves and installs the SteamCMD executable for the backend runtime.
 * Responsibility: Reports install status, supports manual executable overrides,
 *  and performs OS-aware download/extraction when SteamCMD is missing.
 */
import { constants, createWriteStream } from 'node:fs'
import { access, appendFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import type { IncomingMessage } from 'node:http'
import { get } from 'node:https'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import extractZip from 'extract-zip'
import type { InstallLogSnapshot, InstallStatus } from '@shared/contracts'
import { logError, normalizeError } from '@shared/api-error-utils'
import { AppError } from '@backend/utils/errors'
import {
  getSteamCmdPlatformBehavior,
  type SteamCmdPlatformProfile
} from './steamcmd-platform-profile'

function toInstallError(prefix: string, error: unknown): AppError {
  if (error instanceof AppError) {
    return error
  }

  const message = normalizeError(error).message
  return new AppError('install', `${prefix}: ${message}`)
}

async function isUsableExecutable(path: string, requiresExecutableBit: boolean): Promise<boolean> {
  try {
    const entry = await stat(path)
    if (!entry.isFile()) {
      return false
    }

    if (requiresExecutableBit) {
      await access(path, constants.X_OK)
    }

    return true
  } catch {
    return false
  }
}

function formatInstallLogLine(message: string): string {
  return `[${new Date().toISOString()}] ${message}`
}

function describeUnknownError(error: unknown): string {
  return normalizeError(error).message
}

async function findExecutableInDir(
  rootDir: string,
  fileName: string,
  maxDepth: number,
  requiresExecutableBit: boolean
): Promise<string | undefined> {
  const normalizedTarget = fileName.toLowerCase()

  async function walk(currentDir: string, depth: number): Promise<string | undefined> {
    let entries
    try {
      entries = await readdir(currentDir, { withFileTypes: true, encoding: 'utf8' })
    } catch {
      return undefined
    }

    for (const entry of entries) {
      if (!entry.isFile()) {
        continue
      }

      if (entry.name.toLowerCase() !== normalizedTarget) {
        continue
      }

      const candidatePath = join(currentDir, entry.name)
      if (await isUsableExecutable(candidatePath, requiresExecutableBit)) {
        return candidatePath
      }
    }

    if (depth >= maxDepth) {
      return undefined
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue
      }

      const nested = await walk(join(currentDir, entry.name), depth + 1)
      if (nested) {
        return nested
      }
    }

    return undefined
  }

  return await walk(rootDir, 0)
}

async function run(command: string, args: string[], cwd: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'ignore' })
    child.once('error', (error) => {
      reject(toInstallError('Extraction command failed', error))
    })
    child.once('close', (code) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new AppError('install', `Extraction command failed: ${command} ${args.join(' ')}`))
    })
  })
}

async function listDirectoryTree(rootDir: string, maxDepth: number): Promise<string[]> {
  async function walk(currentDir: string, currentDepth: number, relativePrefix: string): Promise<string[]> {
    const entries = await readdir(currentDir, { withFileTypes: true, encoding: 'utf8' })
    if (entries.length === 0) {
      return [`${relativePrefix || '.'} <empty>`]
    }

    const lines: string[] = []
    const sortedEntries = [...entries].sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }))

    for (const entry of sortedEntries) {
      const relativePath = relativePrefix ? `${relativePrefix}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        lines.push(`${relativePath}/`)
        if (currentDepth < maxDepth) {
          lines.push(...(await walk(join(currentDir, entry.name), currentDepth + 1, relativePath)))
        }
        continue
      }
      lines.push(relativePath)
    }

    return lines
  }

  try {
    const entry = await stat(rootDir)
    if (!entry.isDirectory()) {
      return ['<not a directory>']
    }
  } catch (error) {
    return [`<missing: ${describeUnknownError(error)}>`]
  }

  try {
    return await walk(rootDir, 0, '')
  } catch (error) {
    return [`<unreadable: ${describeUnknownError(error)}>`]
  }
}

function download(url: string, targetPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false
    let activeResponse: IncomingMessage | null = null
    let file: ReturnType<typeof createWriteStream> | null = null

    const rejectOnce = (error: AppError) => {
      if (settled) {
        return
      }
      settled = true
      activeResponse?.destroy()
      file?.destroy()
      void rm(targetPath, { force: true })
        .catch(() => undefined)
        .finally(() => reject(error))
    }

    const resolveOnce = () => {
      if (settled) {
        return
      }
      settled = true
      resolve()
    }

    const requestDownload = (currentUrl: string, redirectsRemaining: number) => {
      const request = get(currentUrl, (res) => {
        activeResponse = res
        const statusCode = res.statusCode ?? 0
        const location = res.headers?.location

        if (statusCode >= 300 && statusCode < 400) {
          res.resume()
          if (!location) {
            rejectOnce(new AppError('install', `SteamCMD download failed with status ${statusCode}`))
            return
          }
          if (redirectsRemaining <= 0) {
            rejectOnce(new AppError('install', 'SteamCMD download failed: too many redirects'))
            return
          }
          requestDownload(new URL(location, currentUrl).toString(), redirectsRemaining - 1)
          return
        }

        if (statusCode < 200 || statusCode >= 400) {
          res.resume()
          rejectOnce(new AppError('install', `SteamCMD download failed with status ${statusCode}`))
          return
        }

        res.once('error', (error) => {
          rejectOnce(toInstallError('SteamCMD download failed', error))
        })

        file = createWriteStream(targetPath)
        file.once('error', (error) => {
          rejectOnce(toInstallError('SteamCMD download failed', error))
        })

        res.pipe(file)
        file.on('finish', () => {
          file?.close((error) => {
            if (error) {
              rejectOnce(toInstallError('SteamCMD download failed', error))
              return
            }
            resolveOnce()
          })
        })
      })

      request.once('error', (error) => {
        rejectOnce(toInstallError('SteamCMD download failed', error))
      })
    }

    requestDownload(url, 3)
  })
}

export class SteamCmdInstallManager {
  private manualExecutablePath: string | null = null
  private logWriteChain: Promise<void> = Promise.resolve()

  constructor(
    private readonly rootDir: string,
    private readonly platformProfile: SteamCmdPlatformProfile
  ) {}

  private get platformBehavior() {
    return getSteamCmdPlatformBehavior(this.platformProfile)
  }

  private get installDir(): string {
    return join(this.rootDir, 'steamcmd')
  }

  private get installLogPath(): string {
    return join(this.rootDir, 'steamcmd-install.log')
  }

  get defaultExecutablePath(): string {
    return join(this.installDir, this.platformBehavior.expectedExecutableName)
  }

  private async resolveAutoExecutablePath(): Promise<string | undefined> {
    const defaultPath = this.defaultExecutablePath
    if (await isUsableExecutable(defaultPath, this.platformBehavior.requiresExecutableBit)) {
      return defaultPath
    }

    return await findExecutableInDir(
      this.installDir,
      this.platformBehavior.expectedExecutableName,
      2,
      this.platformBehavior.requiresExecutableBit
    )
  }

  private async withLogLock<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.logWriteChain.then(operation, operation)
    this.logWriteChain = next.then(
      () => undefined,
      () => undefined
    )
    return await next
  }

  private async writeInstallLog(content: string): Promise<void> {
    await this.withLogLock(async () => {
      await mkdir(this.rootDir, { recursive: true })
      await writeFile(this.installLogPath, content, 'utf8')
    })
  }

  private async appendInstallLog(message: string): Promise<void> {
    await this.withLogLock(async () => {
      await mkdir(this.rootDir, { recursive: true })
      await appendFile(this.installLogPath, `${formatInstallLogLine(message)}\n`, 'utf8')
    })
  }

  private async startInstallLog(): Promise<void> {
    const lines = [
      formatInstallLogLine('SteamCMD install attempt started'),
      formatInstallLogLine(`runtimePlatform=${process.platform}`),
      formatInstallLogLine(`profile=${this.platformProfile}`),
      formatInstallLogLine(`rootDir=${this.rootDir}`),
      formatInstallLogLine(`installDir=${this.installDir}`),
      formatInstallLogLine(`defaultExecutablePath=${this.defaultExecutablePath}`),
      formatInstallLogLine(`manualExecutablePath=${this.manualExecutablePath ?? '(none)'}`),
      formatInstallLogLine(`WINEPREFIX=${process.env['WINEPREFIX'] ?? '(unset)'}`),
      ''
    ]
    await this.writeInstallLog(lines.join('\n'))
  }

  private async logInstallDirectorySnapshot(label: string): Promise<void> {
    await this.appendInstallLog(`${label}:`)
    const lines = await listDirectoryTree(this.installDir, 2)
    for (const line of lines) {
      await this.appendInstallLog(`  ${line}`)
    }
  }

  async getInstallLog(): Promise<InstallLogSnapshot> {
    try {
      const content = await readFile(this.installLogPath, 'utf8')
      return {
        path: this.installLogPath,
        content,
        exists: true
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') {
        return {
          path: this.installLogPath,
          content: '',
          exists: false
        }
      }
      throw toInstallError('Failed to read SteamCMD install log', error)
    }
  }

  setManualExecutablePath(path: string | null | undefined): void {
    const normalizedPath = path?.trim()
    this.manualExecutablePath = normalizedPath && normalizedPath.length > 0 ? normalizedPath : null
  }

  async getStatus(): Promise<InstallStatus> {
    if (
      this.manualExecutablePath &&
      (await isUsableExecutable(this.manualExecutablePath, this.platformBehavior.requiresExecutableBit))
    ) {
      return {
        installed: true,
        executablePath: this.manualExecutablePath,
        source: 'manual'
      }
    }

    const executablePath = await this.resolveAutoExecutablePath()
    if (executablePath) {
      return {
        installed: true,
        executablePath,
        source: 'auto'
      }
    }

    return {
      installed: false,
      executablePath: this.defaultExecutablePath,
      source: 'missing'
    }
  }

  async ensureInstalled(): Promise<InstallStatus> {
    const status = await this.getStatus()
    if (status.installed) {
      await this.writeInstallLog(
        [
          formatInstallLogLine('SteamCMD install skipped because a usable executable already exists'),
          formatInstallLogLine(`source=${status.source}`),
          formatInstallLogLine(`executablePath=${status.executablePath}`),
          ''
        ].join('\n')
      )
      return status
    }

    await this.startInstallLog()

    try {
      const downloadUrl = this.platformBehavior.downloadUrl
      await mkdir(this.installDir, { recursive: true })
      await this.logInstallDirectorySnapshot('Install directory before download')

      const archivePath = join(this.installDir, this.platformBehavior.archiveFileName)
      await this.appendInstallLog(`Downloading SteamCMD from ${downloadUrl}`)
      await this.appendInstallLog(`Archive target path=${archivePath}`)
      await download(downloadUrl, archivePath)
      await this.appendInstallLog('Download completed successfully')

      if (this.platformBehavior.archiveKind === 'zip') {
        await this.appendInstallLog(`Extracting ZIP archive in-process to ${this.installDir}`)
        try {
          await extractZip(archivePath, { dir: this.installDir })
        } catch (error) {
          throw toInstallError('ZIP extraction failed', error)
        }
      } else {
        await this.appendInstallLog(`Extracting archive with tar -xzf ${archivePath} -C ${this.installDir}`)
        await run('tar', ['-xzf', archivePath, '-C', this.installDir], this.installDir)
      }

      await this.logInstallDirectorySnapshot('Install directory after extraction')
      await rm(archivePath, { force: true })
      await this.appendInstallLog('Installer archive removed after extraction')

      const resolvedExecutablePath = await this.resolveAutoExecutablePath()
      await this.appendInstallLog(`Resolved executable after extraction=${resolvedExecutablePath ?? '(not found)'}`)
      if (!resolvedExecutablePath) {
        throw new AppError('install', 'SteamCMD was downloaded but executable validation failed')
      }

      await this.appendInstallLog('SteamCMD install completed successfully')
      return {
        installed: true,
        executablePath: resolvedExecutablePath,
        source: 'auto'
      }
    } catch (error) {
      await this.appendInstallLog(`Install failed: ${describeUnknownError(error)}`)
      await this.logInstallDirectorySnapshot('Install directory at failure')
      logError('SteamCmdInstallManager::ensureInstalled', normalizeError(error))
      throw error
    }
  }
}
