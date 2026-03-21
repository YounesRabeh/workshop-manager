/**
 * Overview: content-folder-scanner.ts module in backend/services.
 * Responsibility: Holds the primary logic/exports for this area of the app.
 */
import { readdir, stat } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import type { ContentFolderFileEntry } from '@shared/contracts'
import { AppError } from '@backend/utils/errors'

function normalizeRelativePath(path: string): string {
  return path.replace(/\\/g, '/')
}

function compareByNameAsc(a: { name: string }, b: { name: string }): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
}

export async function listContentFolderFiles(folderPath: string): Promise<ContentFolderFileEntry[]> {
  const normalizedInput = folderPath.trim()
  if (normalizedInput.length === 0) {
    throw new AppError('validation', 'Content folder path is required.')
  }

  const rootPath = resolve(normalizedInput)

  let rootStats
  try {
    rootStats = await stat(rootPath)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown filesystem error'
    throw new AppError('command_failed', `Failed to read content folder: ${message}`)
  }

  if (!rootStats.isDirectory()) {
    throw new AppError('validation', 'Selected content folder is not a directory.')
  }

  const files: ContentFolderFileEntry[] = []

  const walk = async (currentPath: string): Promise<void> => {
    let entries
    try {
      entries = await readdir(currentPath, { withFileTypes: true })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown filesystem error'
      throw new AppError('command_failed', `Failed to read directory "${currentPath}": ${message}`)
    }

    entries.sort(compareByNameAsc)

    for (const entry of entries) {
      const absolutePath = resolve(currentPath, entry.name)

      if (entry.isDirectory()) {
        await walk(absolutePath)
        continue
      }

      if (!entry.isFile()) {
        // Skip non-regular entries (symlinks, sockets, devices, etc.) to avoid unsafe traversal.
        continue
      }

      let fileStats
      try {
        fileStats = await stat(absolutePath)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown filesystem error'
        throw new AppError('command_failed', `Failed to read file "${absolutePath}": ${message}`)
      }

      if (!fileStats.isFile()) {
        continue
      }

      files.push({
        absolutePath,
        relativePath: normalizeRelativePath(relative(rootPath, absolutePath)),
        sizeBytes: fileStats.size
      })
    }
  }

  await walk(rootPath)
  files.sort((a, b) => a.relativePath.localeCompare(b.relativePath, undefined, { sensitivity: 'base' }))
  return files
}
