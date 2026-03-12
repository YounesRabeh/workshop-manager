import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { listContentFolderFiles } from '../../src/backend/services/content-folder-scanner'

describe('content folder scanner', () => {
  it('recursively lists files (including hidden) with relative paths and sizes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'content-scan-'))
    await mkdir(join(root, '.hidden'), { recursive: true })
    await mkdir(join(root, 'mods', 'nested'), { recursive: true })

    await writeFile(join(root, 'root.txt'), 'hello', 'utf8')
    await writeFile(join(root, '.hidden', 'secret.dat'), 'abc', 'utf8')
    await writeFile(join(root, 'mods', 'nested', 'child.bin'), Buffer.from([1, 2, 3, 4]))

    const files = await listContentFolderFiles(root)

    expect(files.map((file) => file.relativePath)).toEqual([
      '.hidden/secret.dat',
      'mods/nested/child.bin',
      'root.txt'
    ])
    expect(files.map((file) => file.sizeBytes)).toEqual([3, 4, 5])
  })

  it('fails when path is not a directory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'content-scan-file-'))
    const filePath = join(root, 'single.txt')
    await writeFile(filePath, 'x', 'utf8')

    await expect(listContentFolderFiles(filePath)).rejects.toThrow('not a directory')
  })

  it('skips symlink entries during scan', async () => {
    const root = await mkdtemp(join(tmpdir(), 'content-scan-symlink-'))
    const targetPath = join(root, 'target.txt')
    await writeFile(targetPath, 'target', 'utf8')

    try {
      await symlink(targetPath, join(root, 'target-link.txt'))
    } catch {
      // Symlink creation may be restricted on some platforms/CI.
      return
    }

    const files = await listContentFolderFiles(root)
    expect(files.map((file) => file.relativePath)).toEqual(['target.txt'])
  })
})
