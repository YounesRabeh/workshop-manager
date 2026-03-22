/**
 * Overview: Prepares SteamCMD workshop command inputs for upload, update, and visibility operations.
 * Responsibility: Validates drafts, checks update content folders,
 *  writes run-scoped VDF files, and returns executable command arguments.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { UploadDraft } from '@shared/contracts'
import { AppError } from '@backend/utils/errors'
import { validateDraft } from '@backend/utils/validation'
import { listContentFolderFiles } from './content-folder-scanner'
import { buildWorkshopArgs } from './steam-output-parser'
import { generateWorkshopVdf } from './vdf-generator'

export interface PreparedWorkshopCommand {
  runId: string
  args: string[]
  publishedFileId?: string
}

function createRunId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
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
  constructor(private readonly runtimeDir: string) {}

  async prepare(
    username: string,
    draft: UploadDraft,
    mode: 'upload' | 'update' | 'visibility'
  ): Promise<PreparedWorkshopCommand> {
    validateDraft(draft, mode)
    if (mode === 'update') {
      await ensureUpdateContentFolderHasFiles(draft)
    }

    const runId = createRunId()
    const vdfPath = join(this.runtimeDir, `${runId}.vdf`)
    await mkdir(this.runtimeDir, { recursive: true })
    await writeFile(vdfPath, generateWorkshopVdf(draft, mode), 'utf8')

    return {
      runId,
      args: buildWorkshopArgs(username, undefined, vdfPath),
      publishedFileId: draft.publishedFileId
    }
  }
}
