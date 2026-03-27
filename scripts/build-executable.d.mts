export interface PackagingTarget {
  platformArg: '--win' | '--mac' | '--linux'
  target: 'nsis' | 'dmg' | 'AppImage'
}

export interface BuildExecutableOptions {
  generateIcon?: boolean
}

export interface ParsedBuildExecutableOptions {
  generateIcon: boolean
}

export interface BuildStep {
  label: string
  command: string
  args: string[]
}

export function resolvePnpmCommand(platform?: string): string

export function getPackagingTargetForPlatform(platform: string): PackagingTarget

export function getElectronBuilderArgsForPlatform(platform: string): string[]

export function parseBuildExecutableOptions(argv?: string[]): ParsedBuildExecutableOptions

export function buildStepsForPlatform(
  platform: string,
  options?: BuildExecutableOptions
): BuildStep[]
