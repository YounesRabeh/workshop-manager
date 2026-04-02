/**
 * Overview: Centralizes the supported SteamCMD platform layouts and runtime behaviors.
 * Responsibility: Maps the host runtime to a SteamCMD profile and exposes
 *  the install/runtime rules each profile needs.
 */
export type SteamCmdPlatformProfile = 'linux' | 'windows'

export interface SteamCmdPlatformBehavior {
  profile: SteamCmdPlatformProfile
  downloadUrl: string
  archiveFileName: string
  archiveKind: 'tar.gz' | 'zip'
  expectedExecutableName: 'steamcmd.sh' | 'steamcmd.exe'
  requiresExecutableBit: boolean
  useShellHost: boolean
  hideWindowsConsole: boolean
  interactiveLineEnding: '\n' | '\r\n'
  loginExecution: 'interactive' | 'one_shot'
  workshopExecution: 'interactive' | 'one_shot'
  persistentSessionStartup: 'empty_process' | 'startup_args' | 'none'
  identityResolution: 'steamcmd_output' | 'steamcmd_output_then_custom_profile'
  waitForPromptBeforeInteractiveLogin: boolean
  enableInteractiveLoginRetry: boolean
  enablePromptDispatchFallback: boolean
}

const STEAMCMD_PLATFORM_BEHAVIORS: Record<SteamCmdPlatformProfile, SteamCmdPlatformBehavior> = {
  linux: {
    profile: 'linux',
    downloadUrl: 'https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz',
    archiveFileName: 'steamcmd.tar.gz',
    archiveKind: 'tar.gz',
    expectedExecutableName: 'steamcmd.sh',
    requiresExecutableBit: true,
    useShellHost: false,
    hideWindowsConsole: false,
    interactiveLineEnding: '\n',
    loginExecution: 'interactive',
    workshopExecution: 'interactive',
    persistentSessionStartup: 'empty_process',
    identityResolution: 'steamcmd_output',
    waitForPromptBeforeInteractiveLogin: false,
    enableInteractiveLoginRetry: false,
    enablePromptDispatchFallback: false
  },
  windows: {
    profile: 'windows',
    downloadUrl: 'https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip',
    archiveFileName: 'steamcmd.zip',
    archiveKind: 'zip',
    expectedExecutableName: 'steamcmd.exe',
    requiresExecutableBit: false,
    useShellHost: false,
    hideWindowsConsole: true,
    interactiveLineEnding: '\r\n',
    loginExecution: 'one_shot',
    workshopExecution: 'one_shot',
    persistentSessionStartup: 'none',
    identityResolution: 'steamcmd_output_then_custom_profile',
    waitForPromptBeforeInteractiveLogin: false,
    enableInteractiveLoginRetry: false,
    enablePromptDispatchFallback: false
  }
}

export function resolveSteamCmdPlatformProfile(platform: NodeJS.Platform = process.platform): SteamCmdPlatformProfile {
  if (platform === 'linux') {
    return 'linux'
  }
  if (platform === 'win32') {
    return 'windows'
  }
  throw new Error(`Unsupported SteamCMD platform profile for runtime platform: ${platform}`)
}

export function getSteamCmdPlatformBehavior(profile: SteamCmdPlatformProfile): SteamCmdPlatformBehavior {
  return STEAMCMD_PLATFORM_BEHAVIORS[profile]
}
