/**
 * Overview: Exposes a typed, minimal renderer API over Electron IPC.
 * Responsibility: Bridges frontend calls/events to whitelisted main-process channels via `contextBridge` and `ipcRenderer`.
 */
import { contextBridge, ipcRenderer } from 'electron'
import type {
  AdvancedSettings,
  ContentFolderFileEntry,
  InstallLogSnapshot,
  InstallStatus,
  LoginInput,
  ModProfile,
  PersistedRunLog,
  PreferredAuthMode,
  RunEvent,
  RunResult,
  SaveAdvancedSettingsInput,
  SteamProfileSummary,
  UploadInput,
  VisibilityUpdateInput,
  WorkshopItemSummary,
  WorkshopItemsPage,
  WorkshopItemsPageInput
} from '@shared/contracts'
import { IPC_CHANNELS } from '@shared/ipc'

export interface WorkshopApi {
  ensureSteamCmdInstalled: () => Promise<InstallStatus>
  getAppVersion: () => Promise<{ version: string }>
  login: (input: LoginInput) => Promise<{ sessionId: string; rememberedUsername?: string }>
  quitApp: () => Promise<{ ok: true }>
  logout: () => Promise<{ ok: true }>
  clearStoredSession: () => Promise<{ ok: true }>
  savePreferredAuthMode: (payload: { preferredAuthMode: PreferredAuthMode }) => Promise<{ ok: true }>
  submitSteamGuardCode: (payload: { sessionId: string; code: string }) => Promise<{ ok: true }>
  uploadMod: (payload: UploadInput) => Promise<RunResult>
  updateMod: (payload: UploadInput) => Promise<RunResult>
  updateVisibility: (payload: VisibilityUpdateInput) => Promise<unknown>
  getProfiles: () => Promise<{
    profiles: ModProfile[]
    rememberedUsername?: string
    rememberAuth?: boolean
    hasStoredAuth?: boolean
    preferredAuthMode?: PreferredAuthMode
  }>
  getAdvancedSettings: () => Promise<AdvancedSettings>
  getInstallLog: () => Promise<InstallLogSnapshot>
  saveAdvancedSettings: (payload: SaveAdvancedSettingsInput) => Promise<AdvancedSettings>
  saveProfile: (payload: { profile: ModProfile }) => Promise<ModProfile>
  deleteProfile: (payload: { profileId: string }) => Promise<{ ok: true }>
  getRunLogs: () => Promise<PersistedRunLog[]>
  getRunLog: (runId: string) => Promise<PersistedRunLog | null>
  getCurrentProfile: () => Promise<SteamProfileSummary>
  getMyWorkshopItems: (payload: { appId?: string }) => Promise<WorkshopItemSummary[]>
  getMyWorkshopItemsPage: (payload: WorkshopItemsPageInput) => Promise<WorkshopItemsPage>
  listContentFolderFiles: (payload: { folderPath: string }) => Promise<ContentFolderFileEntry[]>
  openPath: (payload: { path: string }) => Promise<{ ok: true; error?: string }>
  openExternal: (payload: { url: string }) => Promise<{ ok: true; error?: string }>
  getLocalImagePreview: (payload: { path: string }) => Promise<string | undefined>
  pickFolder: () => Promise<string | undefined>
  pickFile: () => Promise<string | undefined>
  pickSteamCmdExecutable: () => Promise<string | undefined>
  pickFiles: () => Promise<string[]>
  onRunEvent: (callback: (event: RunEvent) => void) => () => void
}

const api: WorkshopApi = {
  /** Requests the main process to verify or install SteamCMD. */
  ensureSteamCmdInstalled: () => ipcRenderer.invoke(IPC_CHANNELS.ensureSteamCmdInstalled),
  /** Returns the app version. */
  getAppVersion: () => ipcRenderer.invoke(IPC_CHANNELS.getAppVersion),
  /** Authenticates the Steam account and establishes an active session. */
  login: (input) => ipcRenderer.invoke(IPC_CHANNELS.login, input),
  /** Requests application shutdown and performs the associated cleanup. */
  quitApp: () => ipcRenderer.invoke(IPC_CHANNELS.quitApp),
  /** Ends the Steam session and clears its active authentication state. */
  logout: () => ipcRenderer.invoke(IPC_CHANNELS.logout),
  /** Requests deletion of saved Steam authentication. */
  clearStoredSession: () => ipcRenderer.invoke(IPC_CHANNELS.clearStoredSession),
  /** Persists preferred auth mode to the user-data store. */
  savePreferredAuthMode: (payload) => ipcRenderer.invoke(IPC_CHANNELS.savePreferredAuthMode, payload),
  /** Submits Steam Guard code to the active service. */
  submitSteamGuardCode: (payload) => ipcRenderer.invoke(IPC_CHANNELS.submitSteamGuardCode, payload),
  /** Sends a validated create draft to the main process for upload. */
  uploadMod: (payload) => ipcRenderer.invoke(IPC_CHANNELS.uploadMod, payload),
  /** Sends a validated update draft to the main process. */
  updateMod: (payload) => ipcRenderer.invoke(IPC_CHANNELS.updateMod, payload),
  /** Updates visibility from the current inputs. */
  updateVisibility: (payload) => ipcRenderer.invoke(IPC_CHANNELS.updateVisibility, payload),
  /** Returns the profiles. */
  getProfiles: () => ipcRenderer.invoke(IPC_CHANNELS.getProfiles),
  /** Returns settings with the encrypted API key replaced by its safe UI representation. */
  getAdvancedSettings: () => ipcRenderer.invoke(IPC_CHANNELS.getAdvancedSettings),
  /** Returns the install log. */
  getInstallLog: () => ipcRenderer.invoke(IPC_CHANNELS.getInstallLog),
  /** Persists advanced settings to the user-data store. */
  saveAdvancedSettings: (payload) => ipcRenderer.invoke(IPC_CHANNELS.saveAdvancedSettings, payload),
  /** Persists profile to the user-data store. */
  saveProfile: (payload) => ipcRenderer.invoke(IPC_CHANNELS.saveProfile, payload),
  /** Deletes profile from persistent storage. */
  deleteProfile: (payload) => ipcRenderer.invoke(IPC_CHANNELS.deleteProfile, payload),
  /** Returns the run logs. */
  getRunLogs: () => ipcRenderer.invoke(IPC_CHANNELS.getRunLogs),
  /** Returns the run log. */
  getRunLog: (runId) => ipcRenderer.invoke(IPC_CHANNELS.getRunLog, { runId }),
  /** Fetches the currently authenticated Steam profile. */
  getCurrentProfile: () => ipcRenderer.invoke(IPC_CHANNELS.getCurrentProfile),
  /** Fetches the current account's Workshop items using the configured access policy. */
  getMyWorkshopItems: (payload) => ipcRenderer.invoke(IPC_CHANNELS.getMyWorkshopItems, payload),
  /** Fetches one page of the current account's Workshop items. */
  getMyWorkshopItemsPage: (payload) => ipcRenderer.invoke(IPC_CHANNELS.getMyWorkshopItemsPage, payload),
  /** Requests a bounded scan of regular files under the selected content folder. */
  listContentFolderFiles: (payload) => ipcRenderer.invoke(IPC_CHANNELS.listContentFolderFiles, payload),
  /** Asks the main process to open a local file or folder with the operating system. */
  openPath: (payload) => ipcRenderer.invoke(IPC_CHANNELS.openPath, payload),
  /** Asks the main process to open a validated external URL. */
  openExternal: (payload) => ipcRenderer.invoke(IPC_CHANNELS.openExternal, payload),
  /** Returns the local image preview. */
  getLocalImagePreview: (payload) => ipcRenderer.invoke(IPC_CHANNELS.getLocalImagePreview, payload),
  /** Opens a picker so the user can select folder. */
  pickFolder: () => ipcRenderer.invoke(IPC_CHANNELS.pickFolder),
  /** Opens a picker so the user can select file. */
  pickFile: () => ipcRenderer.invoke(IPC_CHANNELS.pickFile),
  /** Opens a picker so the user can select SteamCMD executable. */
  pickSteamCmdExecutable: () => ipcRenderer.invoke(IPC_CHANNELS.pickSteamCmdExecutable),
  /** Opens a picker so the user can select files. */
  pickFiles: () => ipcRenderer.invoke(IPC_CHANNELS.pickFiles),
  /** Subscribes to run events and returns an unsubscribe function. */
  onRunEvent: (callback) => {
    /** Subscribes to a renderer event and returns a function that removes the listener. */
    const listener = (_event: Electron.IpcRendererEvent, payload: RunEvent) => {
      callback(payload)
    }
    ipcRenderer.on(IPC_CHANNELS.runEvent, listener)
    return () => ipcRenderer.off(IPC_CHANNELS.runEvent, listener)
  }
}

contextBridge.exposeInMainWorld('workshop', api)
