/**
 * Overview: Generates a standard SHA-256 checksum manifest for release artifacts.
 * Responsibility: Scans the top-level `dist/` output directory for downloadable
 * release files and writes deterministic `SHA256SUMS` output beside them.
 */
import { createHash } from 'node:crypto'
import { readdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'

export const DEFAULT_RELEASE_DIR = 'dist'
export const CHECKSUM_MANIFEST_FILE_NAME = 'SHA256SUMS'
export const LEGACY_CHECKSUM_FILE_SUFFIX = '.checksum.txt'
export const RELEASE_CHECKSUM_EXTENSIONS = ['.AppImage', '.exe', '.dmg', '.deb', '.rpm', '.msi', '.zip']

export function isChecksummedReleaseArtifact(filename) {
  return RELEASE_CHECKSUM_EXTENSIONS.some((extension) => filename.endsWith(extension))
}

export async function listChecksummedReleaseArtifacts(releaseDir = DEFAULT_RELEASE_DIR) {
  const resolvedReleaseDir = resolve(releaseDir)
  const entries = await readdir(resolvedReleaseDir, { withFileTypes: true })

  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter(isChecksummedReleaseArtifact)
    .sort()
}

export async function createChecksumEntries(releaseDir = DEFAULT_RELEASE_DIR) {
  const resolvedReleaseDir = resolve(releaseDir)
  const artifactNames = await listChecksummedReleaseArtifacts(resolvedReleaseDir)
  const entries = []

  for (const artifactName of artifactNames) {
    const bytes = await readFile(join(resolvedReleaseDir, artifactName))
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    entries.push({
      artifactName,
      content: `${sha256}  ${artifactName}\n`
    })
  }

  return entries
}

export async function writeChecksumManifest(releaseDir = DEFAULT_RELEASE_DIR) {
  const resolvedReleaseDir = resolve(releaseDir)
  const entries = await createChecksumEntries(resolvedReleaseDir)
  const existingFiles = await readdir(resolvedReleaseDir, { withFileTypes: true })
  const legacyChecksumFiles = existingFiles
    .filter((entry) => entry.isFile() && entry.name.endsWith(LEGACY_CHECKSUM_FILE_SUFFIX))
    .map((entry) => unlink(join(resolvedReleaseDir, entry.name)))

  await Promise.all(legacyChecksumFiles)
  await writeFile(
    join(resolvedReleaseDir, CHECKSUM_MANIFEST_FILE_NAME),
    entries.map((entry) => entry.content).join(''),
    'utf8'
  )

  return {
    releaseDir: resolvedReleaseDir,
    artifactCount: entries.length,
    checksumFileName: CHECKSUM_MANIFEST_FILE_NAME
  }
}

function isCliEntrypoint() {
  const entry = process.argv[1]
  if (!entry) {
    return false
  }
  return pathToFileURL(resolve(entry)).href === import.meta.url
}

async function main(argv = process.argv.slice(2)) {
  const releaseDir = argv[0] ?? DEFAULT_RELEASE_DIR
  const result = await writeChecksumManifest(releaseDir)
  console.log(
    `[checksums] Wrote ${result.checksumFileName} for ${result.artifactCount} artifact(s) in ${resolve(releaseDir)}`
  )
}

if (isCliEntrypoint()) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
