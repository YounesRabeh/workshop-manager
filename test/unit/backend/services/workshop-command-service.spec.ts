import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppError } from '@backend/utils/errors'
import { WorkshopCommandService } from '@backend/services/workshop/command-service'
import { listContentFolderFiles } from '@backend/services/workshop/content-folder-scanner'

vi.mock('@backend/services/workshop/content-folder-scanner', () => ({
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
          changenote: ''
        },
        'upload'
      )

      expect(command.runId).toMatch(/^\d+-[0-9a-f]+$/)
      expect(command.args.join(' ')).toContain('workshop_build_item')
      expect(command.vdfPath).toMatch(/\.vdf$/)

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
            changenote: ''
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

  it('prepares Windows workshop commands with expected args', async () => {
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
          changenote: ''
        },
        'upload'
      )

      expect(command.vdfPath).toMatch(/\.vdf$/)
      expect(command.args.slice(0, 2)).toEqual(['+login', 'alice'])
      expect(command.args).toContain('+workshop_build_item')
      expect(command.args.at(-1)).toBe('+quit')
    } finally {
      await rm(runtimeDir, { recursive: true, force: true })
    }
  })

  it('copies only included files into a temporary upload folder and cleans it up', async () => {
    const root = await mkdtemp(join(tmpdir(), 'wm-command-filtered-'))
    const runtimeDir = join(root, 'runtime')
    const contentDir = join(root, 'content')
    const includedPath = join(contentDir, 'keep.txt')
    const excludedPath = join(contentDir, 'nested', 'ignore.txt')
    await mkdir(join(contentDir, 'nested'), { recursive: true })
    await writeFile(includedPath, 'keep', 'utf8')
    await writeFile(excludedPath, 'ignore', 'utf8')
    vi.mocked(listContentFolderFiles).mockResolvedValueOnce([
      { absolutePath: includedPath, relativePath: 'keep.txt', sizeBytes: 4 },
      { absolutePath: excludedPath, relativePath: 'nested/ignore.txt', sizeBytes: 6 }
    ])

    try {
      const service = new WorkshopCommandService(runtimeDir)
      const command = await service.prepare(
        'alice',
        {
          appId: '480',
          contentFolder: contentDir,
          title: 'Filtered Upload',
          excludedContentPaths: ['nested/ignore.txt']
        },
        'upload'
      )
      const vdf = await readFile(command.vdfPath, 'utf8')
      const stagingPath = join(runtimeDir, 'staged-content', command.runId)

      expect(vdf).toContain(`"contentfolder"\t"${stagingPath}`)
      expect(await readFile(join(stagingPath, 'keep.txt'), 'utf8')).toBe('keep')
      await expect(access(join(stagingPath, 'nested', 'ignore.txt'))).rejects.toMatchObject({ code: 'ENOENT' })

      await command.cleanup()
      await expect(access(stagingPath)).rejects.toMatchObject({ code: 'ENOENT' })
      await expect(access(command.vdfPath)).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
