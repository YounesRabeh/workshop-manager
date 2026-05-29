export const DEFAULT_BUILD_TARGET: 'bundle'
export const RELEASE_BUILD_TARGETS: readonly ['linux', 'win']
export const SUPPORTED_BUILD_TARGETS: readonly ['bundle', 'linux', 'win', 'windows', 'all']

export interface BuildPlatformOptions {
  target?: 'bundle' | 'linux' | 'win' | 'windows' | 'all'
  checksums?: boolean
  icons?: boolean
}

export interface ParsedBuildPlatformOptions {
  target: 'bundle' | 'linux' | 'win' | 'all'
  checksums: boolean
  icons: boolean
}

export interface BuildPlatformStep {
  label: string
  command: string
  args: string[]
}

export function normalizeBuildTarget(target?: string): 'bundle' | 'linux' | 'win' | 'all'
export function parseBuildPlatformOptions(argv?: string[]): ParsedBuildPlatformOptions
export function createDockerBuildStep(
  target: string,
  options?: Pick<BuildPlatformOptions, 'icons'>
): BuildPlatformStep
export function createBuildPlatformSteps(
  options?: BuildPlatformOptions,
  platform?: string
): BuildPlatformStep[]
