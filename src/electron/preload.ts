/**
 * Overview: Exposes a typed, minimal renderer API over Electron IPC.
 * Responsibility: Bridges frontend calls/events to whitelisted main-process channels via `contextBridge` and `ipcRenderer`.
 */
import { contextBridge, ipcRenderer } from 'electron'
import type {
  AdvancedSettings,
  ContentFolderFileEntry,
  InstallStatus,
  LoginInput,
  ModProfile,
  RunEvent,
  SaveAdvancedSettingsInput,
  SteamProfileSummary,
  UploadDraft,
  VisibilityUpdateInput,
  WorkshopItemSummary
} from '@shared/contracts'
import { IPC_CHANNELS } from '@shared/ipc'

export interface WorkshopApi {
  ensureSteamCmdInstalled: () => Promise<InstallStatus>
  getAppVersion: () => Promise<{ version: string }>
  login: (input: LoginInput) => Promise<{ sessionId: string; rememberedUsername?: string }>
  quitApp: () => Promise<{ ok: true }>
  logout: () => Promise<{ ok: true }>
  clearStoredSession: () => Promise<{ ok: true }>
  submitSteamGuardCode: (payload: { sessionId: string; code: string }) => Promise<{ ok: true }>
  uploadMod: (payload: { profileId: string; draft: UploadDraft }) => Promise<unknown>
  updateMod: (payload: { profileId: string; draft: UploadDraft }) => Promise<unknown>
  updateVisibility: (payload: VisibilityUpdateInput) => Promise<unknown>
  getProfiles: () => Promise<{
    profiles: ModProfile[]
    rememberedUsername?: string
    rememberAuth?: boolean
    hasStoredAuth?: boolean
  }>
  getAdvancedSettings: () => Promise<AdvancedSettings>
  saveAdvancedSettings: (payload: SaveAdvancedSettingsInput) => Promise<AdvancedSettings>
  saveProfile: (payload: { profile: ModProfile }) => Promise<ModProfile>
  deleteProfile: (payload: { profileId: string }) => Promise<{ ok: true }>
  getRunLogs: () => Promise<unknown>
  getRunLog: (runId: string) => Promise<unknown>
  getCurrentProfile: () => Promise<SteamProfileSummary>
  getMyWorkshopItems: (payload: { appId?: string }) => Promise<WorkshopItemSummary[]>
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
  ensureSteamCmdInstalled: () => ipcRenderer.invoke(IPC_CHANNELS.ensureSteamCmdInstalled),
  getAppVersion: () => ipcRenderer.invoke(IPC_CHANNELS.getAppVersion),
  login: (input) => ipcRenderer.invoke(IPC_CHANNELS.login, input),
  quitApp: () => ipcRenderer.invoke(IPC_CHANNELS.quitApp),
  logout: () => ipcRenderer.invoke(IPC_CHANNELS.logout),
  clearStoredSession: () => ipcRenderer.invoke(IPC_CHANNELS.clearStoredSession),
  submitSteamGuardCode: (payload) => ipcRenderer.invoke(IPC_CHANNELS.submitSteamGuardCode, payload),
  uploadMod: (payload) => ipcRenderer.invoke(IPC_CHANNELS.uploadMod, payload),
  updateMod: (payload) => ipcRenderer.invoke(IPC_CHANNELS.updateMod, payload),
  updateVisibility: (payload) => ipcRenderer.invoke(IPC_CHANNELS.updateVisibility, payload),
  getProfiles: () => ipcRenderer.invoke(IPC_CHANNELS.getProfiles),
  getAdvancedSettings: () => ipcRenderer.invoke(IPC_CHANNELS.getAdvancedSettings),
  saveAdvancedSettings: (payload) => ipcRenderer.invoke(IPC_CHANNELS.saveAdvancedSettings, payload),
  saveProfile: (payload) => ipcRenderer.invoke(IPC_CHANNELS.saveProfile, payload),
  deleteProfile: (payload) => ipcRenderer.invoke(IPC_CHANNELS.deleteProfile, payload),
  getRunLogs: () => ipcRenderer.invoke(IPC_CHANNELS.getRunLogs),
  getRunLog: (runId) => ipcRenderer.invoke(IPC_CHANNELS.getRunLog, { runId }),
  getCurrentProfile: () => ipcRenderer.invoke(IPC_CHANNELS.getCurrentProfile),
  getMyWorkshopItems: (payload) => ipcRenderer.invoke(IPC_CHANNELS.getMyWorkshopItems, payload),
  listContentFolderFiles: (payload) => ipcRenderer.invoke(IPC_CHANNELS.listContentFolderFiles, payload),
  openPath: (payload) => ipcRenderer.invoke(IPC_CHANNELS.openPath, payload),
  openExternal: (payload) => ipcRenderer.invoke(IPC_CHANNELS.openExternal, payload),
  getLocalImagePreview: (payload) => ipcRenderer.invoke(IPC_CHANNELS.getLocalImagePreview, payload),
  pickFolder: () => ipcRenderer.invoke(IPC_CHANNELS.pickFolder),
  pickFile: () => ipcRenderer.invoke(IPC_CHANNELS.pickFile),
  pickSteamCmdExecutable: () => ipcRenderer.invoke(IPC_CHANNELS.pickSteamCmdExecutable),
  pickFiles: () => ipcRenderer.invoke(IPC_CHANNELS.pickFiles),
  onRunEvent: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: RunEvent) => {
      callback(payload)
    }
    ipcRenderer.on(IPC_CHANNELS.runEvent, listener)
    return () => ipcRenderer.off(IPC_CHANNELS.runEvent, listener)
  }
}

contextBridge.exposeInMainWorld('workshop', api)
