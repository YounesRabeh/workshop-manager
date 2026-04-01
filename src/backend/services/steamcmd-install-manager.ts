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
import { AppError } from '@backend/utils/errors'

const STEAMCMD_URLS: Record<NodeJS.Platform, string | undefined> = {
  win32: 'https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip',
  linux: 'https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz',
  darwin: undefined,
  aix: undefined,
  android: undefined,
  cygwin: undefined,
  freebsd: undefined,
  haiku: undefined,
  netbsd: undefined,
  openbsd: undefined,
  sunos: undefined
}

function toInstallError(prefix: string, error: unknown): AppError {
  if (error instanceof AppError) {
    return error
  }

  const message = error instanceof Error ? error.message : String(error)
  return new AppError('install', `${prefix}: ${message}`)
}

async function isUsableExecutable(path: string): Promise<boolean> {
  try {
    const entry = await stat(path)
    if (!entry.isFile()) {
      return false
    }

    if (process.platform !== 'win32') {
      await access(path, constants.X_OK)
    }

    return true
  } catch {
    return false
  }
}

function expectedExecutableName(platform: NodeJS.Platform): string {
  return platform === 'win32' ? 'steamcmd.exe' : 'steamcmd.sh'
}

function formatInstallLogLine(message: string): string {
  return `[${new Date().toISOString()}] ${message}`
}

function describeUnknownError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

async function findExecutableInDir(
  rootDir: string,
  fileName: string,
  maxDepth: number
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
      if (await isUsableExecutable(candidatePath)) {
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
    const file = createWriteStream(targetPath)
    let settled = false
    let activeResponse: IncomingMessage | null = null

    const rejectOnce = (error: AppError) => {
      if (settled) {
        return
      }
      settled = true
      activeResponse?.destroy()
      file.destroy()
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

    file.once('error', (error) => {
      rejectOnce(toInstallError('SteamCMD download failed', error))
    })

    const request = get(url, (res) => {
      activeResponse = res
      if (!res.statusCode || res.statusCode >= 400) {
        res.resume()
        rejectOnce(new AppError('install', `SteamCMD download failed with status ${res.statusCode}`))
        return
      }

      res.once('error', (error) => {
        rejectOnce(toInstallError('SteamCMD download failed', error))
      })

      res.pipe(file)
      file.on('finish', () => {
        file.close((error) => {
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
  })
}

export class SteamCmdInstallManager {
  private manualExecutablePath: string | null = null
  private logWriteChain: Promise<void> = Promise.resolve()

  constructor(private readonly rootDir: string) {}

  private get installDir(): string {
    return join(this.rootDir, 'steamcmd')
  }

  private get installLogPath(): string {
    return join(this.rootDir, 'steamcmd-install.log')
  }

  get defaultExecutablePath(): string {
    return process.platform === 'win32'
      ? join(this.installDir, 'steamcmd.exe')
      : join(this.installDir, 'steamcmd.sh')
  }

  private async resolveAutoExecutablePath(): Promise<string | undefined> {
    const defaultPath = this.defaultExecutablePath
    if (await isUsableExecutable(defaultPath)) {
      return defaultPath
    }

    return await findExecutableInDir(this.installDir, expectedExecutableName(process.platform), 2)
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
      formatInstallLogLine(`platform=${process.platform}`),
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
    if (this.manualExecutablePath && (await isUsableExecutable(this.manualExecutablePath))) {
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
      const downloadUrl = STEAMCMD_URLS[process.platform]
      if (!downloadUrl) {
        await this.appendInstallLog('Auto-install is unavailable for this operating system')
        throw new AppError('install', 'SteamCMD auto-install is unavailable for this OS. Provide manual path.')
      }

      await mkdir(this.installDir, { recursive: true })
      await this.logInstallDirectorySnapshot('Install directory before download')

      const archivePath = join(this.installDir, process.platform === 'win32' ? 'steamcmd.zip' : 'steamcmd.tar.gz')
      await this.appendInstallLog(`Downloading SteamCMD from ${downloadUrl}`)
      await this.appendInstallLog(`Archive target path=${archivePath}`)
      await download(downloadUrl, archivePath)
      await this.appendInstallLog('Download completed successfully')

      if (process.platform === 'win32') {
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
      throw error
    }
  }
}
