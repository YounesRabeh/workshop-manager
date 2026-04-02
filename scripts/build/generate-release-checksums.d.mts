export const DEFAULT_RELEASE_DIR: 'dist'
export const CHECKSUM_FILE_SUFFIX: '.checksum.txt'
export const RELEASE_CHECKSUM_EXTENSIONS: readonly ['.AppImage', '.exe', '.dmg', '.deb', '.rpm', '.msi', '.zip']

export function isChecksummedReleaseArtifact(filename: string): boolean
export function listChecksummedReleaseArtifacts(releaseDir?: string): Promise<string[]>
export function getChecksumFileName(artifactName: string): string
export function createChecksumEntries(releaseDir?: string): Promise<Array<{
  artifactName: string
  checksumFileName: string
  content: string
}>>
export function writeChecksumFiles(releaseDir?: string): Promise<{
  releaseDir: string
  artifactCount: number
  checksumFiles: string[]
}>
