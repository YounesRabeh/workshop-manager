/**
 * Domain: SteamCMD execution.
 * Overview: Resolves feature flags controlling SteamCMD execution strategy.
 * Responsibility: Parses process environment inputs into a normalized policy
 * used by runtime services during migration from interactive to script mode.
 */
export type SteamCmdExecutionMode = 'interactive' | 'script'

export interface SteamCmdExecutionPolicy {
  mode: SteamCmdExecutionMode
}

export function resolveSteamCmdExecutionPolicy(
  env: NodeJS.ProcessEnv = process.env
): SteamCmdExecutionPolicy {
  const requestedMode = env['STEAMCMD_EXECUTION_MODE']?.trim().toLowerCase()
  const mode: SteamCmdExecutionMode = requestedMode === 'script' ? 'script' : 'interactive'

  return { mode }
}
