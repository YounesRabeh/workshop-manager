/**
 * Domain: SteamCMD installation.
 * Overview: Resolves and installs the SteamCMD executable for the backend runtime.
 * Responsibility: Reports install status, supports manual executable overrides,
 *  and performs OS-aware download/extraction when SteamCMD is missing.
 */
import { constants, createWriteStream } from 'node:fs'
import { access, appendFile, lstat, mkdir, mkdtemp, open, readFile, readdir, rename, rm, rmdir, stat, writeFile } from 'node:fs/promises'
import type { IncomingMessage } from 'node:http'
import { get } from 'node:https'
import type { ClientRequest } from 'node:http'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { extractSteamCmdZip } from './zip-extractor'
import type { InstallLogSnapshot, InstallStatus } from '@shared/contracts'
import { logError, normalizeError } from '@shared/api-error-utils'
import { AppError } from '@backend/utils/errors'
import {
  getSteamCmdPlatformBehavior,
  type SteamCmdPlatformProfile
} from './platform-profile'

const DOWNLOAD_TIMEOUT_MS = 30_000
const MAX_DOWNLOAD_BYTES = 128 * 1024 * 1024
const MAX_DOWNLOAD_REDIRECTS = 3
const TRUSTED_DOWNLOAD_HOSTS = new Set(['steamcdn-a.akamaihd.net'])

/** Preserves application errors and wraps other failures with installation context. */
function toInstallError(prefix: string, error: unknown): AppError {
  if (error instanceof AppError) {
    return error
  }

  const message = normalizeError(error).message
  return new AppError('install', `${prefix}: ${message}`)
}

/** Checks that the path is a file and, where required, has its executable bit set. */
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

/** Formats install log line for display or logging. */
function formatInstallLogLine(message: string): string {
  return `[${new Date().toISOString()}] ${message}`
}

/** Converts an unknown thrown value into a readable installation error detail. */
function describeUnknownError(error: unknown): string {
  return normalizeError(error).message
}

/** Searches a SteamCMD directory tree for a usable executable. */
async function findExecutableInDir(
  rootDir: string,
  fileName: string,
  maxDepth: number,
  requiresExecutableBit: boolean
): Promise<string | undefined> {
  const normalizedTarget = fileName.toLowerCase()

  /** Searches nested directories for a matching, usable SteamCMD executable. */
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

/** Runs the extraction command and rejects if it cannot complete successfully. */
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

/** Builds a bounded directory listing for the SteamCMD install log. */
async function listDirectoryTree(rootDir: string, maxDepth: number): Promise<string[]> {
  /** Adds directory entries recursively, stopping at the requested depth. */
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

/** Downloads the SteamCMD archive while enforcing redirect, size, and timeout limits. */
function download(url: string, targetPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false
    let activeResponse: IncomingMessage | null = null
    let activeRequest: ClientRequest | null = null
    let file: ReturnType<typeof createWriteStream> | null = null
    let receivedBytes = 0

    /** Rejects the download promise only if it has not already settled. */
    const rejectOnce = (error: AppError) => {
      if (settled) {
        return
      }
      settled = true
      activeResponse?.destroy?.()
      activeRequest?.destroy?.()
      file?.destroy?.()
      void rm(targetPath, { force: true })
        .catch(() => undefined)
        .finally(() => reject(error))
    }

    /** Resolves the download promise only if it has not already settled. */
    const resolveOnce = () => {
      if (settled) {
        return
      }
      settled = true
      resolve()
    }

    /** Requests one archive URL and follows only the configured number of trusted redirects. */
    const requestDownload = (currentUrl: string, redirectsRemaining: number) => {
      const parsedUrl = new URL(currentUrl)
      if (parsedUrl.protocol !== 'https:' || !TRUSTED_DOWNLOAD_HOSTS.has(parsedUrl.hostname)) {
        rejectOnce(new AppError('install', 'SteamCMD download redirected to an untrusted source'))
        return
      }

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

        const declaredLength = Number(res.headers?.['content-length'])
        if (Number.isFinite(declaredLength) && declaredLength > MAX_DOWNLOAD_BYTES) {
          rejectOnce(new AppError('install', 'SteamCMD download exceeds the allowed archive size'))
          return
        }

        res.once('error', (error) => {
          rejectOnce(toInstallError('SteamCMD download failed', error))
        })

        file = createWriteStream(targetPath)
        file.once('error', (error) => {
          rejectOnce(toInstallError('SteamCMD download failed', error))
        })

        res.on('data', (chunk: Buffer) => {
          receivedBytes += chunk.length
          if (receivedBytes > MAX_DOWNLOAD_BYTES) {
            rejectOnce(new AppError('install', 'SteamCMD download exceeds the allowed archive size'))
          }
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
      activeRequest = request

      request.setTimeout?.(DOWNLOAD_TIMEOUT_MS, () => {
        rejectOnce(new AppError('timeout', 'SteamCMD download timed out'))
      })

      request.once('error', (error) => {
        rejectOnce(toInstallError('SteamCMD download failed', error))
      })
    }

    requestDownload(url, MAX_DOWNLOAD_REDIRECTS)
  })
}

/** Checks the archive's leading bytes for the ZIP signature; this does not authenticate its publisher. */
async function validateArchiveSignature(path: string, kind: 'tar.gz' | 'zip'): Promise<void> {
  const header = Buffer.alloc(4)
  const file = await open(path, 'r')
  try {
    await file.read(header, 0, header.length, 0)
  } finally {
    await file.close()
  }
  const hasGzipSignature = header[0] === 0x1f && header[1] === 0x8b
  const hasZipSignature = header[0] === 0x50 && header[1] === 0x4b && header[2] === 0x03 && header[3] === 0x04
  if ((kind === 'tar.gz' && !hasGzipSignature) || (kind === 'zip' && !hasZipSignature)) {
    throw new AppError('install', 'SteamCMD download is not a valid installer archive')
  }
}

export class SteamCmdInstallManager {
  private manualExecutablePath: string | null = null
  private logWriteChain: Promise<void> = Promise.resolve()
  private installAttempt: Promise<InstallStatus> | null = null

  /** Initializes installation paths, platform behavior, and log state. */
  constructor(
    private readonly rootDir: string,
    private readonly platformProfile: SteamCmdPlatformProfile
  ) {}

  /** Returns the SteamCMD behavior profile selected for the current platform. */
  private get platformBehavior() {
    return getSteamCmdPlatformBehavior(this.platformProfile)
  }

  /** Returns the SteamCMD installation directory. */
  private get installDir(): string {
    return join(this.rootDir, 'steamcmd')
  }

  /** Returns the path of the SteamCMD install log. */
  private get installLogPath(): string {
    return join(this.rootDir, 'steamcmd-install.log')
  }

  /** Returns the expected SteamCMD executable path for the active platform. */
  get defaultExecutablePath(): string {
    return join(this.installDir, this.platformBehavior.expectedExecutableName)
  }

  /** Finds the SteamCMD executable in the automatic installation directory. */
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

  /** Serializes install-log writes so concurrent messages are not interleaved. */
  private async withLogLock<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.logWriteChain.then(operation, operation)
    this.logWriteChain = next.then(
      () => undefined,
      () => undefined
    )
    return await next
  }

  /** Persists queued install-log lines to the configured log file. */
  private async writeInstallLog(content: string): Promise<void> {
    await this.withLogLock(async () => {
      await mkdir(this.rootDir, { recursive: true })
      await writeFile(this.installLogPath, content, 'utf8')
    })
  }

  /** Appends the supplied entry to install log. */
  private async appendInstallLog(message: string): Promise<void> {
    await this.withLogLock(async () => {
      await mkdir(this.rootDir, { recursive: true })
      await appendFile(this.installLogPath, `${formatInstallLogLine(message)}\n`, 'utf8')
    })
  }

  /** Creates the install log and records the current platform and installation paths. */
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

  /** Records a bounded snapshot of the installation directory for troubleshooting. */
  private async logInstallDirectorySnapshot(label: string): Promise<void> {
    await this.appendInstallLog(`${label}:`)
    const lines = await listDirectoryTree(this.installDir, 2)
    for (const line of lines) {
      await this.appendInstallLog(`  ${line}`)
    }
  }

  /** Returns the install log. */
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

  /** Validates and stores the user's manual SteamCMD executable path. */
  setManualExecutablePath(path: string | null | undefined): void {
    const normalizedPath = path?.trim()
    this.manualExecutablePath = normalizedPath && normalizedPath.length > 0 ? normalizedPath : null
  }

  /** Returns whether SteamCMD is installed, its executable path, and how it was selected. */
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

  /** Reuses a valid SteamCMD installation or installs it when none is available. */
  async ensureInstalled(): Promise<InstallStatus> {
    if (this.installAttempt) return await this.installAttempt
    this.installAttempt = this.install()
    try {
      return await this.installAttempt
    } finally {
      this.installAttempt = null
    }
  }

  /** Installs SteamCMD into the configured runtime directory. */
  private async install(): Promise<InstallStatus> {
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

    const archivePath = join(this.installDir, this.platformBehavior.archiveFileName)
    let stagingDir: string | undefined
    let ownsArchive = false
    try {
      const downloadUrl = this.platformBehavior.downloadUrl
      await mkdir(this.installDir, { recursive: true })
      if (this.platformBehavior.archiveKind === 'zip' &&
        ((await lstat(this.installDir)).isSymbolicLink() || (await readdir(this.installDir)).length > 0)) {
        throw new AppError('install', 'SteamCMD installation directory is not empty or is a link. Move it aside or select an existing SteamCMD executable in Advanced Settings.')
      }
      await this.logInstallDirectorySnapshot('Install directory before download')

      await this.appendInstallLog(`Downloading SteamCMD from ${downloadUrl}`)
      await this.appendInstallLog(`Archive target path=${archivePath}`)
      ownsArchive = true
      await download(downloadUrl, archivePath)
      await validateArchiveSignature(archivePath, this.platformBehavior.archiveKind)
      await this.appendInstallLog('Download completed successfully')

      if (this.platformBehavior.archiveKind === 'zip') {
        stagingDir = await mkdtemp(join(this.rootDir, '.steamcmd-extract-'))
        await this.appendInstallLog(`Extracting ZIP archive in-process to ${stagingDir}`)
        try {
          await extractSteamCmdZip(archivePath, stagingDir)
          if (!await findExecutableInDir(stagingDir, this.platformBehavior.expectedExecutableName, 2, false)) {
            throw new AppError('install', 'SteamCMD was downloaded but executable validation failed')
          }
          await rm(archivePath)
          ownsArchive = false
          // Refuse a nonempty destination rather than merge through existing filesystem links.
          await rmdir(this.installDir)
          await rename(stagingDir, this.installDir)
          stagingDir = undefined
        } catch (error) {
          throw toInstallError('ZIP extraction failed', error)
        }
      } else {
        await this.appendInstallLog(`Extracting archive with tar -xzf ${archivePath} -C ${this.installDir}`)
        await run('tar', ['-xzf', archivePath, '-C', this.installDir], this.installDir)
      }

      await this.logInstallDirectorySnapshot('Install directory after extraction')
      if (ownsArchive) {
        await rm(archivePath, { force: true })
        ownsArchive = false
      }
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
      if (ownsArchive) await rm(archivePath, { force: true }).catch(() => undefined)
      await this.appendInstallLog(`Install failed: ${describeUnknownError(error)}`)
      await this.logInstallDirectorySnapshot('Install directory at failure')
      logError('SteamCmdInstallManager::ensureInstalled', normalizeError(error))
      throw error
    } finally {
      if (stagingDir) await rm(stagingDir, { recursive: true, force: true })
    }
  }
}
