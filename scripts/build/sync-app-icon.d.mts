/**
 * Type declarations for `scripts/build/sync-app-icon.mjs`.
 * They document the exported launcher/icon helpers and keep script tests typed.
 */
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

/** Escapes single quotes for use inside a single-quoted bash string literal. */
export function escapeSingleQuotesForBash(value: string): string

/** Creates the canonical Linux desktop-entry content for the project launcher. */
export function buildLinuxLauncherContent(
  options: LinuxLauncherContentOptions
): string

/** Rewrites the launcher fields this app manages inside an existing `.desktop` file. */
export function rewriteDesktopEntryMappings(
  original: string,
  options: DesktopEntryMappingOptions
): string
