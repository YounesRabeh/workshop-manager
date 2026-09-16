/**
 * Domain: Application build configuration.
 * Overview: Defines compile-time feature flags that are baked into packaged application artifacts.
 * Responsibility: Provides one editable source of truth for SteamCMD launch behavior and applies
 * the configured process flags without mutating caller-owned argument arrays.
 */
export const BUILD_FLAGS = Object.freeze({
  steamCmdNoIpv6: true
})

export function buildSteamCmdLaunchArgs(
  args: readonly string[],
  noIpv6: boolean = BUILD_FLAGS.steamCmdNoIpv6
): string[] {
  const launchArgs = [...args]
  if (noIpv6 && !launchArgs.includes('-noipv6')) {
    launchArgs.unshift('-noipv6')
  }
  return launchArgs
}
