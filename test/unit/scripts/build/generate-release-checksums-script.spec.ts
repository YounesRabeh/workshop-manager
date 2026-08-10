import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  CHECKSUM_MANIFEST_FILE_NAME,
  createChecksumEntries,
  isChecksummedReleaseArtifact,
  listChecksummedReleaseArtifacts,
  writeChecksumManifest
} from '../../../../scripts/build/generate-release-checksums.mjs'

describe('generate-release-checksums script helpers', () => {
  it('detects supported downloadable release artifacts', () => {
    expect(isChecksummedReleaseArtifact('Workshop Manager-1.0.9-linux-x86_64.AppImage')).toBe(true)
    expect(isChecksummedReleaseArtifact('Workshop Manager-1.0.9-win-x64.exe')).toBe(true)
    expect(isChecksummedReleaseArtifact('latest.yml')).toBe(false)
    expect(isChecksummedReleaseArtifact('builder-debug.yml')).toBe(false)
  })

  it('lists only top-level release artifact files in sorted order', async () => {
    const root = await mkdtemp(join(tmpdir(), 'release-checksums-'))
    await writeFile(join(root, 'zeta.exe'), 'z')
    await writeFile(join(root, 'alpha.AppImage'), 'a')
    await writeFile(join(root, 'builder-debug.yml'), 'ignored')

    const artifacts = await listChecksummedReleaseArtifacts(root)

    expect(artifacts).toEqual(['alpha.AppImage', 'zeta.exe'])
  })

  it('writes one deterministic standard checksum manifest', async () => {
    const root = await mkdtemp(join(tmpdir(), 'release-checksums-'))
    const appImageName = 'Workshop Manager-1.0.9-linux-x86_64.AppImage'
    const exeName = 'Workshop Manager-1.0.9-win-x64.exe'
    await writeFile(join(root, appImageName), 'linux-bytes')
    await writeFile(join(root, exeName), 'windows-bytes')

    const expectedAppImageHash = createHash('sha256').update('linux-bytes').digest('hex')
    const expectedExeHash = createHash('sha256').update('windows-bytes').digest('hex')

    const entries = await createChecksumEntries(root)
    expect(entries).toEqual([
      {
        artifactName: appImageName,
        content: `${expectedAppImageHash}  ${appImageName}\n`
      },
      {
        artifactName: exeName,
        content: `${expectedExeHash}  ${exeName}\n`
      }
    ])

    await writeFile(join(root, `${appImageName}.checksum.txt`), 'legacy checksum')

    const result = await writeChecksumManifest(root)
    expect(result.artifactCount).toBe(2)
    expect(result.checksumFileName).toBe(CHECKSUM_MANIFEST_FILE_NAME)
    await expect(readFile(join(root, `${appImageName}.checksum.txt`), 'utf8')).rejects.toMatchObject({
      code: 'ENOENT'
    })
    expect(await readFile(join(root, CHECKSUM_MANIFEST_FILE_NAME), 'utf8')).toBe(
      `${expectedAppImageHash}  ${appImageName}\n${expectedExeHash}  ${exeName}\n`
    )
  })
})
