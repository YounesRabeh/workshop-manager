import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { extractSteamCmdZip } from '@backend/services/steamcmd/zip-extractor'
import { zipFixture } from '../../../helpers/zip-fixture'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })

async function setup(entries: Parameters<typeof zipFixture>[0]) {
  const root = await mkdtemp(join(tmpdir(), 'steamcmd-zip-'))
  roots.push(root)
  const archive = join(root, 'archive.zip')
  const destination = await mkdtemp(join(root, 'stage-'))
  await writeFile(archive, zipFixture(entries))
  return { root, archive, destination }
}

describe('SteamCMD ZIP extraction', () => {
  it('extracts ordinary and nested files', async () => {
    const { archive, destination } = await setup([
      { name: 'portable/', mode: 0o040755 },
      { name: 'portable/steamcmd.exe', content: 'steamcmd' }
    ])
    await extractSteamCmdZip(archive, destination)
    expect(await readFile(join(destination, 'portable/steamcmd.exe'), 'utf8')).toBe('steamcmd')
  })

  it('rejects a symlink followed by a duplicate regular-file entry without writing outside', async () => {
    const { root, archive, destination } = await setup([
      { name: 'escape', content: '../victim', mode: 0o120777 },
      { name: 'escape', content: 'overwritten' }
    ])
    await writeFile(join(root, 'victim'), 'untouched')
    await expect(extractSteamCmdZip(archive, destination)).rejects.toThrow(/entry type/)
    expect(await readFile(join(root, 'victim'), 'utf8')).toBe('untouched')
    expect(await readdir(destination)).toEqual([])
  })

  it.each(['../escape', '/escape', 'C:/escape', 'a\\escape', 'file:stream', 'NUL.txt', 'COM1', 'a./file', 'a /file', 'a//file', 'a/./file'])('rejects unsafe path %s', async name => {
    const { archive, destination } = await setup([{ name, content: 'bad' }])
    await expect(extractSteamCmdZip(archive, destination)).rejects.toThrow()
    expect(await readdir(destination)).toEqual([])
  })

  it('rejects case-insensitive duplicate files', async () => {
    const { archive, destination } = await setup([{ name: 'file', content: 'first' }, { name: 'FILE', content: 'second' }])
    await expect(extractSteamCmdZip(archive, destination)).rejects.toThrow(/duplicate/i)
  })

  it('rejects excessive total declared output before decompressing', async () => {
    const { archive, destination } = await setup([{ name: 'huge', size: 513 * 1024 * 1024 }])
    await expect(extractSteamCmdZip(archive, destination)).rejects.toThrow(/size limit/)
    expect(await readdir(destination)).toEqual([])
  })

  it('rejects a compressed file that expands beyond its declared size', async () => {
    const { archive, destination } = await setup([{ name: 'liar', content: 'x'.repeat(1024 * 1024), size: 1 }])
    await expect(extractSteamCmdZip(archive, destination)).rejects.toThrow()
  })

  it('rejects excessive entry counts', async () => {
    const { archive, destination } = await setup(Array.from({ length: 4097 }, (_, i) => ({ name: `file${i}` })))
    await expect(extractSteamCmdZip(archive, destination)).rejects.toThrow(/entry limit/)
    expect(await readdir(destination)).toEqual([])
  })
})
