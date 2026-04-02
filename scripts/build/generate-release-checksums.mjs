/**
 * Overview: Generates per-artifact checksum files for packaged desktop artifacts.
 * Responsibility: Scans the top-level `dist/` output directory for downloadable
 * release files and writes deterministic `<artifact>.checksum.txt` files beside them.
 */
import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'

export const DEFAULT_RELEASE_DIR = 'dist'
export const CHECKSUM_FILE_SUFFIX = '.checksum.txt'
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
    .sort((left, right) => left.localeCompare(right))
}

export function getChecksumFileName(artifactName) {
  return `${artifactName}${CHECKSUM_FILE_SUFFIX}`
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
      checksumFileName: getChecksumFileName(artifactName),
      content: `${sha256}  ${artifactName}\n`
    })
  }

  return entries
}

export async function writeChecksumFiles(releaseDir = DEFAULT_RELEASE_DIR) {
  const resolvedReleaseDir = resolve(releaseDir)
  const entries = await createChecksumEntries(resolvedReleaseDir)

  for (const entry of entries) {
    await writeFile(join(resolvedReleaseDir, entry.checksumFileName), entry.content, 'utf8')
  }

  return {
    releaseDir: resolvedReleaseDir,
    artifactCount: entries.length,
    checksumFiles: entries.map((entry) => entry.checksumFileName)
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
  const result = await writeChecksumFiles(releaseDir)
  console.log(
    `[checksums] Wrote ${result.checksumFiles.length} checksum file(s) in ${resolve(releaseDir)}`
  )
}

if (isCliEntrypoint()) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
