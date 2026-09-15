/** Validates Steam Workshop preview images before they enter the publish flow. */
import { readFile, stat } from 'node:fs/promises'
import { extname } from 'node:path'
import { AppError } from '@backend/utils/errors'

export const MAX_WORKSHOP_PREVIEW_BYTES = 1024 * 1024

const SUPPORTED_WORKSHOP_PREVIEW_EXTENSIONS = new Set(['.gif', '.jpeg', '.jpg', '.png'])

function hasExpectedImageSignature(extension: string, bytes: Buffer): boolean {
  if (extension === '.png') {
    return bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  }
  if (extension === '.jpg' || extension === '.jpeg') {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  }
  if (extension === '.gif') {
    const header = bytes.subarray(0, 6).toString('ascii')
    return header === 'GIF87a' || header === 'GIF89a'
  }
  return false
}

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
