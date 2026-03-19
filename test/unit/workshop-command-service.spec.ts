import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppError } from '../../src/backend/utils/errors'
import { WorkshopCommandService } from '../../src/backend/services/workshop-command-service'
import { listContentFolderFiles } from '../../src/backend/services/content-folder-scanner'

vi.mock('../../src/backend/services/content-folder-scanner', () => ({
  listContentFolderFiles: vi.fn(async () => [])
}))

describe('WorkshopCommandService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('prepares upload command and writes a VDF file', async () => {
    const runtimeDir = await mkdtemp(join(tmpdir(), 'wm-command-'))
    try {
      const service = new WorkshopCommandService(runtimeDir)
      const command = await service.prepare(
        'alice',
        {
          appId: '480',
          publishedFileId: '',
          contentFolder: '/mods',
          previewFile: '',
          title: 'Test Upload',
          changenote: '',
          tags: []
        },
        'upload'
      )

      expect(command.runId).toMatch(/^\d+-[0-9a-f]+$/)
      expect(command.args.join(' ')).toContain('workshop_build_item')

      const files = await readdir(runtimeDir)
      expect(files.some((file) => file.endsWith('.vdf'))).toBe(true)
    } finally {
      await rm(runtimeDir, { recursive: true, force: true })
    }
  })

  it('rejects update when content folder is empty', async () => {
    vi.mocked(listContentFolderFiles).mockResolvedValueOnce([])
    const runtimeDir = await mkdtemp(join(tmpdir(), 'wm-command-'))
    try {
      const service = new WorkshopCommandService(runtimeDir)

      await expect(
        service.prepare(
          'alice',
          {
            appId: '480',
            publishedFileId: '100',
            contentFolder: '/mods',
            previewFile: '',
            title: 'Test Update',
            changenote: '',
            tags: []
          },
          'update'
        )
      ).rejects.toMatchObject({
        code: 'validation'
      } as Partial<AppError>)
    } finally {
      await rm(runtimeDir, { recursive: true, force: true })
    }
  })
})
