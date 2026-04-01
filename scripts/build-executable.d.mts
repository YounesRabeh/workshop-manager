/**
 * Type declarations for `scripts/build-executable.mjs`.
 * These keep script-focused unit tests typed without converting the script itself
 * away from plain ESM JavaScript.
 */
export interface PackagingTarget {
  platformArg: '--win' | '--mac' | '--linux'
  target: 'nsis' | 'dmg' | 'AppImage'
}

export interface BuildExecutableOptions {
  generateIcon?: boolean
  targetPlatform?: 'win32' | 'darwin' | 'linux'
}

export interface ParsedBuildExecutableOptions {
  generateIcon: boolean
  targetPlatform?: 'win32' | 'darwin' | 'linux'
}

export interface BuildStep {
  label: string
  command: string
  args: string[]
  env?: Record<string, string>
}

/** Resolves the correct pnpm executable for the requested platform. */
export function resolvePnpmCommand(platform?: string): string

/** Returns the electron-builder target tuple supported by this repository. */
export function getPackagingTargetForPlatform(platform: string): PackagingTarget

/** Builds the local `electron-builder` CLI argument list for a host platform. */
export function getElectronBuilderArgsForPlatform(platform: string): string[]

/** Normalizes a supported explicit packaging target platform. */
export function normalizeBuildTargetPlatform(
  platform: string
): 'win32' | 'darwin' | 'linux'

/** Parses supported CLI flags for the executable packaging script. */
export function parseBuildExecutableOptions(argv?: string[]): ParsedBuildExecutableOptions

/** Describes the ordered subprocess steps the packaging workflow will run. */
export function buildStepsForPlatform(
  platform: string,
  options?: BuildExecutableOptions
): BuildStep[]
