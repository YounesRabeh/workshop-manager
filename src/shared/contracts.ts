export type ErrorCode =
  | 'validation'
  | 'install'
  | 'auth'
  | 'steam_guard'
  | 'command_failed'
  | 'timeout'

export interface ModProfile {
  id: string
  appId: string
  publishedFileId?: string
  contentFolder: string
  previewFile?: string
  title: string
  description?: string
  tags: string[]
}

export interface UploadDraft {
  appId: string
  publishedFileId?: string
  contentFolder: string
  previewFile?: string
  title: string
  description?: string
  changenote?: string
  tags: string[]
  visibility?: 0 | 1 | 2 | 3
  validationErrors?: string[]
}

export type RunEventType =
  | 'run_started'
  | 'phase_changed'
  | 'stdout'
  | 'stderr'
  | 'steam_guard_required'
  | 'run_finished'
  | 'run_failed'
  | 'run_cancelled'

export interface RunEvent {
  runId: string
  ts: number
  type: RunEventType
  line?: string
  phase?: string
  promptType?: 'steam_guard_code' | 'steam_guard_mobile'
  errorCode?: ErrorCode
}

export interface RunResult {
  runId: string
  success: boolean
  publishedFileId?: string
  steamOutputSummary: string
  logPath: string
}

export interface InstallStatus {
  installed: boolean
  version?: string
  executablePath: string
  source: 'auto' | 'manual' | 'missing'
}

export interface ApiError {
  message: string
  code: ErrorCode
}

export type LoginResult =
  | {
      ok: true
      sessionId: string
      rememberedUsername?: string
    }
  | {
      ok: false
      error: ApiError
    }

export interface LoginInput {
  username: string
  password: string
  rememberUsername: boolean
  rememberAuth?: boolean
  useStoredAuth?: boolean
}

export interface AdvancedSettings {
  webApiEnabled: boolean
  hasWebApiKey: boolean
  secureStorageAvailable: boolean
}

export interface SaveAdvancedSettingsInput {
  webApiEnabled: boolean
  webApiKey?: string
  clearWebApiKey?: boolean
}

export interface SteamGuardInput {
  sessionId: string
  code: string
}

export interface UploadInput {
  profileId: string
  draft: UploadDraft
}

export interface VisibilityUpdateInput {
  appId: string
  publishedFileId: string
  visibility: 0 | 1 | 2 | 3
}

export interface SaveProfileInput {
  profile: ModProfile
}

export interface SteamAuthState {
  sessionId: string
  username: string
  waitingForGuard: boolean
}

export interface WorkshopItemSummary {
  publishedFileId: string
  title: string
  previewUrl?: string
  appId?: string
  updatedAt?: number
  visibility?: 0 | 1 | 2 | 3
}

export interface SteamProfileSummary {
  steamId64: string
  personaName?: string
  avatarUrl?: string
  profileUrl: string
}
