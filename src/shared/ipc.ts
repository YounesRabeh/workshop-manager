/**
 * Overview: Central registry of IPC channel names shared between Electron main and preload/renderer.
 * Responsibility: Defines stable, typed channel identifiers for all app commands, queries, and run-event streaming.
 */
export const IPC_CHANNELS = {
  ensureSteamCmdInstalled: 'workshop:ensureSteamCmdInstalled',
  getAppVersion: 'workshop:getAppVersion',
  login: 'workshop:login',
  quitApp: 'workshop:quitApp',
  logout: 'workshop:logout',
  clearStoredSession: 'workshop:clearStoredSession',
  submitSteamGuardCode: 'workshop:submitSteamGuardCode',
  uploadMod: 'workshop:uploadMod',
  updateMod: 'workshop:updateMod',
  updateVisibility: 'workshop:updateVisibility',
  getProfiles: 'workshop:getProfiles',
  getAdvancedSettings: 'workshop:getAdvancedSettings',
  saveAdvancedSettings: 'workshop:saveAdvancedSettings',
  saveProfile: 'workshop:saveProfile',
  deleteProfile: 'workshop:deleteProfile',
  getRunLogs: 'workshop:getRunLogs',
  getRunLog: 'workshop:getRunLog',
  getCurrentProfile: 'workshop:getCurrentProfile',
  getMyWorkshopItems: 'workshop:getMyWorkshopItems',
  listContentFolderFiles: 'workshop:listContentFolderFiles',
  openPath: 'workshop:openPath',
  openExternal: 'workshop:openExternal',
  getLocalImagePreview: 'workshop:getLocalImagePreview',
  pickFolder: 'workshop:pickFolder',
  pickFile: 'workshop:pickFile',
  pickSteamCmdExecutable: 'workshop:pickSteamCmdExecutable',
  pickFiles: 'workshop:pickFiles',
  runEvent: 'workshop:runEvent'
} as const
