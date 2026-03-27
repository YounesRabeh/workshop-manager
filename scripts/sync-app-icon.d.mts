export interface LinuxLauncherContentOptions {
  displayName: string
  projectRootPath: string
  appId: string
  iconAbsolutePath: string
}

export interface DesktopEntryMappingOptions {
  displayName: string
  appId: string
  iconAbsolutePath: string
}

export function escapeSingleQuotesForBash(value: string): string

export function buildLinuxLauncherContent(
  options: LinuxLauncherContentOptions
): string

export function rewriteDesktopEntryMappings(
  original: string,
  options: DesktopEntryMappingOptions
): string
