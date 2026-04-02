import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  CHECKSUM_FILE_SUFFIX,
  createChecksumEntries,
  getChecksumFileName,
  isChecksummedReleaseArtifact,
  listChecksummedReleaseArtifacts,
  writeChecksumFiles
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

  it('writes deterministic per-artifact checksum files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'release-checksums-'))
    const appImageName = 'Workshop Manager-1.0.9-linux-x86_64.AppImage'
    const exeName = 'Workshop Manager-1.0.9-win-x64.exe'
    await writeFile(join(root, appImageName), 'linux-bytes')
    await writeFile(join(root, exeName), 'windows-bytes')

    const expectedAppImageHash = createHash('sha256').update('linux-bytes').digest('hex')
    const expectedExeHash = createHash('sha256').update('windows-bytes').digest('hex')

    expect(getChecksumFileName(appImageName)).toBe(`${appImageName}${CHECKSUM_FILE_SUFFIX}`)

    const entries = await createChecksumEntries(root)
    expect(entries).toEqual([
      {
        artifactName: appImageName,
        checksumFileName: `${appImageName}${CHECKSUM_FILE_SUFFIX}`,
        content: `${expectedAppImageHash}  ${appImageName}\n`
      },
      {
        artifactName: exeName,
        checksumFileName: `${exeName}${CHECKSUM_FILE_SUFFIX}`,
        content: `${expectedExeHash}  ${exeName}\n`
      }
    ])

    const result = await writeChecksumFiles(root)
    expect(result.artifactCount).toBe(2)
    expect(result.checksumFiles).toEqual([
      `${appImageName}${CHECKSUM_FILE_SUFFIX}`,
      `${exeName}${CHECKSUM_FILE_SUFFIX}`
    ])

    const appImageOutput = await readFile(join(root, `${appImageName}${CHECKSUM_FILE_SUFFIX}`), 'utf8')
    const exeOutput = await readFile(join(root, `${exeName}${CHECKSUM_FILE_SUFFIX}`), 'utf8')
    expect(appImageOutput).toBe(`${expectedAppImageHash}  ${appImageName}\n`)
    expect(exeOutput).toBe(`${expectedExeHash}  ${exeName}\n`)
  })
})
