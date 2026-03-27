/**
 * Type declarations for `scripts/kill-old-instance.mjs`.
 * Exported helpers are intentionally declared so tests can validate process
 * targeting logic without shelling out to the real OS commands.
 */
/** Returns whether a process command line looks like this project's app instance. */
export function isTargetProcessForProject(
  command: string,
  projectRootPath: string
): boolean

/** Builds the PowerShell kill script used on Windows. */
export function buildPowershellKillScript(projectRootPath: string): string
