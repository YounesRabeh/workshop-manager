/**
 * Domain: Workshop publishing.
 * Overview: Prepares SteamCMD workshop command inputs for upload, update, and visibility operations.
 * Responsibility: Validates drafts, checks update content folders,
 *  writes run-scoped VDF files, and returns executable command arguments.
 */
import { copyFile, mkdir, rm, statfs, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import type { UploadDraft } from '@shared/contracts'
import { AppError } from '@backend/utils/errors'
import { validateDraft } from '@backend/utils/validation'
import { listContentFolderFiles } from './content-folder-scanner'
import { buildWorkshopArgs } from '../steam/output-parser'
import { generateWorkshopVdf } from './vdf-generator'
import { validateWorkshopPreviewFile } from './preview-validator'

export interface PreparedWorkshopCommand {
  runId: string
  args: string[]
  vdfPath: string
  publishedFileId?: string
  cleanup: () => Promise<void>
}

interface WorkshopCommandServiceDependencies {
  getAvailableDiskBytes?: (path: string) => Promise<number>
}

async function getAvailableDiskBytes(path: string): Promise<number> {
  const filesystem = await statfs(path)
  return Number(filesystem.bavail) * Number(filesystem.bsize)
}

function normalizeExcludedPath(path: string): string {
  const normalized = path.replace(/\\/g, '/').replace(/^\.\//, '')
  const segments = normalized.split('/')
  if (!normalized || normalized.startsWith('/') || segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new AppError('validation', `Invalid excluded content path: ${path}`)
  }
  return normalized
}

async function prepareFilteredContentFolder(
  draft: UploadDraft,
  runtimeDir: string,
  runId: string,
  mode: 'upload' | 'update' | 'visibility',
  resolveAvailableDiskBytes: (path: string) => Promise<number>
): Promise<{ draft: UploadDraft; stagingPath?: string }> {
  const excludedPaths = draft.excludedContentPaths ?? []
  if (mode === 'visibility' || excludedPaths.length === 0) {
    return { draft }
  }

  const contentFolder = draft.contentFolder?.trim()
  if (!contentFolder) {
    throw new AppError('validation', 'A content folder is required when excluding staged files.')
  }

  const excluded = new Set(excludedPaths.map(normalizeExcludedPath))
  const sourceFiles = await listContentFolderFiles(contentFolder)
  const availablePaths = new Set(sourceFiles.map((file) => normalizeExcludedPath(file.relativePath)))
  for (const excludedPath of excluded) {
    if (!availablePaths.has(excludedPath)) {
      throw new AppError('validation', `Excluded content file no longer exists: ${excludedPath}`)
    }
  }

  const includedFiles = sourceFiles.filter((file) => !excluded.has(normalizeExcludedPath(file.relativePath)))
  if (mode === 'upload' && includedFiles.length === 0) {
    throw new AppError('validation', 'At least one content file must be included for upload.')
  }

  if (includedFiles.length === 0) {
    return {
      draft: { ...draft, contentFolder: '' }
    }
  }

  const stagingPath = join(runtimeDir, 'staged-content', runId)
  await mkdir(stagingPath, { recursive: true })
  try {
    const requiredBytes = includedFiles.reduce((total, file) => total + file.sizeBytes, 0)
    const availableBytes = await resolveAvailableDiskBytes(stagingPath)
    if (Number.isFinite(availableBytes) && requiredBytes > availableBytes) {
      throw new AppError('validation', 'Not enough free disk space to stage the selected content files.')
    }
    const copyConcurrency = 8
    for (let start = 0; start < includedFiles.length; start += copyConcurrency) {
      await Promise.all(includedFiles.slice(start, start + copyConcurrency).map(async (file) => {
        const destinationPath = join(stagingPath, normalizeExcludedPath(file.relativePath))
        await mkdir(dirname(destinationPath), { recursive: true })
        await copyFile(file.absolutePath, destinationPath)
      }))
    }
  } catch (error) {
    await rm(stagingPath, { recursive: true, force: true })
    throw error
  }

  return {
    draft: { ...draft, contentFolder: stagingPath },
    stagingPath
  }
}

function createRunId(): string {
  return `${Date.now()}-${randomUUID().replaceAll('-', '')}`
}

async function ensureUpdateContentFolderHasFiles(draft: UploadDraft): Promise<void> {
  const contentFolder = draft.contentFolder?.trim()
  if (!contentFolder) {
    return
  }

  try {
    const files = await listContentFolderFiles(contentFolder)
    if (files.length === 0) {
      throw new AppError('validation', 'Selected content folder is empty. Add files or use preview-only update.')
    }
  } catch (error) {
    if (error instanceof AppError) {
      if (error.code === 'validation') {
        throw error
      }
      throw new AppError('command_failed', 'Could not read content folder. Check path/permissions and retry.')
    }
    throw new AppError('command_failed', 'Could not read content folder. Check path/permissions and retry.')
  }
}

export class WorkshopCommandService {
  private readonly resolveAvailableDiskBytes: (path: string) => Promise<number>

  constructor(
    private readonly runtimeDir: string,
    dependencies: WorkshopCommandServiceDependencies = {}
  ) {
    this.resolveAvailableDiskBytes = dependencies.getAvailableDiskBytes ?? getAvailableDiskBytes
  }

  async prepare(
    username: string,
    draft: UploadDraft,
    mode: 'upload' | 'update' | 'visibility'
  ): Promise<PreparedWorkshopCommand> {
    validateDraft(draft, mode)
    if (mode !== 'visibility') {
      await validateWorkshopPreviewFile(draft.previewFile)
    }
    const runId = createRunId()
    const filteredContent = await prepareFilteredContentFolder(
      draft,
      this.runtimeDir,
      runId,
      mode,
      this.resolveAvailableDiskBytes
    )
    const effectiveDraft = filteredContent.draft
    const vdfPath = join(this.runtimeDir, `${runId}.vdf`)
    const cleanup = async (): Promise<void> => {
      const results = await Promise.allSettled([
        rm(vdfPath, { force: true }),
        ...(filteredContent.stagingPath
          ? [rm(filteredContent.stagingPath, { recursive: true, force: true })]
          : [])
      ])
      const failure = results.find((result) => result.status === 'rejected')
      if (failure?.status === 'rejected') throw failure.reason
    }
    try {
      // A filtered folder has already been scanned and checked before copying.
      if (mode === 'update' && !filteredContent.stagingPath) {
        await ensureUpdateContentFolderHasFiles(effectiveDraft)
      }
      await mkdir(this.runtimeDir, { recursive: true })
      await writeFile(vdfPath, generateWorkshopVdf(effectiveDraft, mode), 'utf8')
    } catch (error) {
      await cleanup()
      throw error
    }

    return {
      runId,
      args: buildWorkshopArgs(username, undefined, vdfPath),
      vdfPath,
      publishedFileId: draft.publishedFileId,
      cleanup
    }
  }
}
