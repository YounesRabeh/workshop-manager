/**
 * Overview: Secures external URLs and local image-preview access at the Electron boundary.
 * Responsibility: Restricts protocols, approves canonical image files, validates signatures,
 * and serves data only for explicitly approved local paths.
 */
import { realpath, stat, readFile } from 'node:fs/promises'
import { extname, resolve } from 'node:path'
import { hasExpectedImageSignature } from '@backend/utils/image-signature'

const MAX_IMAGE_PREVIEW_BYTES = 20 * 1024 * 1024
const IMAGE_MIME_TYPES = new Map([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.gif', 'image/gif']
])

/** Allows only HTTP(S) destinations for links opened outside the application. */
export function isSafeExternalUrl(targetUrl: string): boolean {
  try {
    const parsed = new URL(targetUrl)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}

export class LocalImagePreviewAccess {
  private readonly approvedRealPaths = new Set<string>()

  /** Approves a canonical, bounded image file only after its bytes match the extension. */
  async approve(path: string | undefined): Promise<boolean> {
    const normalizedPath = path?.trim()
    if (!normalizedPath || !IMAGE_MIME_TYPES.has(extname(normalizedPath).toLowerCase())) {
      return false
    }

    try {
      const canonicalPath = await realpath(resolve(normalizedPath))
      const fileStats = await stat(canonicalPath)
      if (!fileStats.isFile() || fileStats.size > MAX_IMAGE_PREVIEW_BYTES) {
        return false
      }
      const extension = extname(canonicalPath).toLowerCase()
      const bytes = await readFile(canonicalPath)
      if (!hasExpectedImageSignature(extension, bytes)) {
        return false
      }
      this.approvedRealPaths.add(canonicalPath)
      return true
    } catch {
      return false
    }
  }

  /** Loads only a previously approved file, rechecking its type and size before returning a data URL. */
  async load(path: string | undefined): Promise<string | undefined> {
    const normalizedPath = path?.trim()
    if (!normalizedPath) {
      return undefined
    }

    try {
      const canonicalPath = await realpath(resolve(normalizedPath))
      if (!this.approvedRealPaths.has(canonicalPath)) {
        return undefined
      }

      const fileStats = await stat(canonicalPath)
      if (!fileStats.isFile() || fileStats.size > MAX_IMAGE_PREVIEW_BYTES) {
        return undefined
      }

      const extension = extname(canonicalPath).toLowerCase()
      const mime = IMAGE_MIME_TYPES.get(extension)
      if (!mime) {
        return undefined
      }

      const bytes = await readFile(canonicalPath)
      if (!hasExpectedImageSignature(extension, bytes)) {
        return undefined
      }
      return `data:${mime};base64,${bytes.toString('base64')}`
    } catch {
      return undefined
    }
  }
}
