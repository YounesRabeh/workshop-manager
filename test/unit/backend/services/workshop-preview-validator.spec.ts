import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { validateWorkshopPreviewFile } from '@backend/services/workshop/preview-validator'

describe('validateWorkshopPreviewFile', () => {
  it('accepts a supported image with the expected file signature', async () => {
    const root = await mkdtemp(join(tmpdir(), 'wm-preview-valid-'))
    const path = join(root, 'preview.png')
    await writeFile(path, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    try {
      await expect(validateWorkshopPreviewFile(path)).resolves.toBeUndefined()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('rejects renamed non-image content immediately', async () => {
    const root = await mkdtemp(join(tmpdir(), 'wm-preview-invalid-'))
    const path = join(root, 'preview.png')
    await writeFile(path, 'not an image', 'utf8')
    try {
      await expect(validateWorkshopPreviewFile(path)).rejects.toMatchObject({
        code: 'validation',
        message: 'Selected Workshop preview is not a valid PNG, JPG, or GIF image.'
      })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
