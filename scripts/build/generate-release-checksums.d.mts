export const DEFAULT_RELEASE_DIR: 'dist'
export const CHECKSUM_MANIFEST_FILE_NAME: 'SHA256SUMS'
export const LEGACY_CHECKSUM_FILE_SUFFIX: '.checksum.txt'
export const RELEASE_CHECKSUM_EXTENSIONS: readonly ['.AppImage', '.exe', '.dmg', '.deb', '.rpm', '.msi', '.zip']

export function isChecksummedReleaseArtifact(filename: string): boolean
export function listChecksummedReleaseArtifacts(releaseDir?: string): Promise<string[]>
export function createChecksumEntries(releaseDir?: string): Promise<Array<{
  artifactName: string
  content: string
}>>
export function writeChecksumManifest(releaseDir?: string): Promise<{
  releaseDir: string
  artifactCount: number
  checksumFileName: 'SHA256SUMS'
}>
