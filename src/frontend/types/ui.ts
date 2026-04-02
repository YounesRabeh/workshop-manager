/**
 * Overview: Declares renderer-local UI state and view-model types.
 * Responsibility: Defines typed shapes for auth, drafts, run logs, navigation steps, 
 * and publish/filter UI contracts used across frontend components/composables.
 */
export type AuthIssueTone = 'danger' | 'warning' | 'info'

export interface AuthIssue {
  title: string
  detail: string
  hint?: string
  tone: AuthIssueTone
}

export type FlowStep = 'mods' | 'update' | 'create'

export type SteamGuardPromptType =
  | 'none'
  | 'waiting'
  | 'steam_guard_code'
  | 'steam_guard_mobile'
  | 'steam_guard_approved'

export interface LoginFormState {
  username: string
  password: string
  rememberUsername: boolean
  rememberAuth: boolean
}

export interface AdvancedSettingsState {
  webApiEnabled: boolean
  webApiKey: string
  hasWebApiKey: boolean
  secureStorageAvailable: boolean
  steamCmdManualPath: string
  steamCmdInstalled: boolean
  steamCmdSource: 'auto' | 'manual' | 'missing'
  loginTimeoutMs: string
  storedSessionTimeoutMs: string
  workshopTimeoutMs: string
  isSaving: boolean
  statusMessage: string
}

export interface UploadDraftState {
  appId: string
  publishedFileId: string
  contentFolder: string
  previewFile: string
  title: string
  releaseNotes: string
}

export interface StagedContentFile {
  absolutePath: string
  relativePath: string
  sizeBytes: number
}

export interface ContentTreeNode {
  id: string
  name: string
  type: 'folder' | 'file'
  relativePath: string
  sizeBytes: number
  fileCount: number
  absolutePath?: string
  children?: ContentTreeNode[]
}

export interface PublishChecklistItem {
  label: string
  ok: boolean
  optional?: boolean
}

export type WorkshopVisibilityFilter = 'all' | 'public' | 'friends' | 'hidden' | 'unlisted' | 'unknown'
