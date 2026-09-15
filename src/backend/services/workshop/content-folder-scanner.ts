/**
 * Domain: Workshop content preparation.
 * Overview: Recursively scans a selected workshop content folder and returns normalized file metadata.
 * Responsibility: Validates the input directory, 
 * traverses regular files safely, and reports relative paths with byte sizes for upload/update checks.
 */
import { readdir, stat } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import type { ContentFolderFileEntry } from '@shared/contracts'
import { AppError } from '@backend/utils/errors'

const MAX_SCAN_DEPTH = 64
const MAX_SCANNED_FILES = 100_000

export interface ContentScanLimits {
  maxDepth?: number
  maxFiles?: number
}

function normalizeRelativePath(path: string): string {
  return path.replace(/\\/g, '/')
}

function compareByNameAsc(a: { name: string }, b: { name: string }): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
}

export async function listContentFolderFiles(
  folderPath: string,
  limits: ContentScanLimits = {}
): Promise<ContentFolderFileEntry[]> {
  const normalizedInput = folderPath.trim()
  if (normalizedInput.length === 0) {
    throw new AppError('validation', 'Content folder path is required.')
  }

  const rootPath = resolve(normalizedInput)
  const maxDepth = limits.maxDepth ?? MAX_SCAN_DEPTH
  const maxFiles = limits.maxFiles ?? MAX_SCANNED_FILES
  if (!Number.isSafeInteger(maxDepth) || maxDepth < 0 || !Number.isSafeInteger(maxFiles) || maxFiles < 1) {
    throw new AppError('validation', 'Content scan limits are invalid.')
  }

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

  const walk = async (currentPath: string, depth: number): Promise<void> => {
    if (depth > maxDepth) {
      throw new AppError('validation', `Content folder hierarchy exceeds ${maxDepth} levels.`)
    }
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
        await walk(absolutePath, depth + 1)
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
      if (files.length > maxFiles) {
        throw new AppError('validation', `Content folder contains more than ${maxFiles.toLocaleString()} files.`)
      }
    }
  }

  await walk(rootPath, 0)
  files.sort((a, b) => a.relativePath.localeCompare(b.relativePath, undefined, { sensitivity: 'base' }))
  return files
}
