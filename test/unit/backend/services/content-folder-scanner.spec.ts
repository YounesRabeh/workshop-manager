import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { listContentFolderFiles } from '@backend/services/workshop/content-folder-scanner'

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

  it('rejects hierarchies deeper than the configured safety limit', async () => {
    const root = await mkdtemp(join(tmpdir(), 'content-scan-depth-'))
    await mkdir(join(root, 'one', 'two'), { recursive: true })
    await writeFile(join(root, 'one', 'two', 'file.txt'), 'x')

    await expect(listContentFolderFiles(root, { maxDepth: 1 })).rejects.toThrow('exceeds 1 levels')
  })

  it('rejects folders exceeding the configured file-count limit', async () => {
    const root = await mkdtemp(join(tmpdir(), 'content-scan-count-'))
    await Promise.all(['one', 'two', 'three'].map((name) => writeFile(join(root, `${name}.txt`), name)))

    await expect(listContentFolderFiles(root, { maxFiles: 2 })).rejects.toThrow('more than 2 files')
  })

  it('rejects invalid safety-limit configuration', async () => {
    await expect(listContentFolderFiles('/tmp', { maxDepth: -1 })).rejects.toThrow('limits are invalid')
  })
})
