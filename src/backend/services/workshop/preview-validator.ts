/**
 * Overview: Validates local Steam Workshop preview images before selection or publishing.
 * Responsibility: Enforces supported formats, file-size limits, readable files, and image signatures
 * so invalid previews fail with actionable validation errors at the file boundary.
 */
import { readFile, stat } from 'node:fs/promises'
import { extname } from 'node:path'
import { AppError } from '@backend/utils/errors'
import { hasExpectedImageSignature } from '@backend/utils/image-signature'

export const MAX_WORKSHOP_PREVIEW_BYTES = 1024 * 1024

const SUPPORTED_WORKSHOP_PREVIEW_EXTENSIONS = new Set(['.gif', '.jpeg', '.jpg', '.png'])

export async function validateWorkshopPreviewFile(previewFile: string | undefined): Promise<void> {
  const previewPath = previewFile?.trim()
  if (!previewPath) return

  const extension = extname(previewPath).toLowerCase()
  if (!SUPPORTED_WORKSHOP_PREVIEW_EXTENSIONS.has(extension)) {
    throw new AppError('validation', 'Steam Workshop previews must be PNG, JPG, or GIF images.')
  }

  try {
    const previewStats = await stat(previewPath)
    if (!previewStats.isFile()) {
      throw new AppError('validation', 'Selected Workshop preview is not a file.')
    }
    if (previewStats.size >= MAX_WORKSHOP_PREVIEW_BYTES) {
      const sizeMiB = (previewStats.size / MAX_WORKSHOP_PREVIEW_BYTES).toFixed(2)
      throw new AppError('validation', `Workshop preview is ${sizeMiB} MB. Steam requires preview images under 1 MB.`)
    }

    const bytes = await readFile(previewPath)
    if (!hasExpectedImageSignature(extension, bytes)) {
      throw new AppError('validation', 'Selected Workshop preview is not a valid PNG, JPG, or GIF image.')
    }
  } catch (error) {
    if (error instanceof AppError) throw error
    throw new AppError('validation', 'Could not read the selected Workshop preview. Check the file path and permissions.')
  }
}
