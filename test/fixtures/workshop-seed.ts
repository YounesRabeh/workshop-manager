/**
 * Deterministic test seeds shared by mocked Workshop flows.
 * Live credentials remain environment-driven in steamcmd-live-login.spec.ts.
 */
import type { UploadDraft, WorkshopItemSummary } from '@shared/contracts'
import packageMetadata from '../../package.json'

export const TEST_APP_VERSION = packageMetadata.version

export const TEST_ACCOUNT = Object.freeze({
  username: 'alice',
  password: 'secret',
  apiKey: 'test-api-key',
  personaName: 'Alice Persona',
  steamId64: '76561197960265729'
})

export const TEST_WORKSHOP = Object.freeze({
  appId: '480',
  publishedFileId: '123',
  contentFolder: '/mods'
})

export function createWorkshopItem(
  overrides: Partial<WorkshopItemSummary> = {}
): WorkshopItemSummary {
  return {
    publishedFileId: TEST_WORKSHOP.publishedFileId,
    title: 'Test Item',
    appId: TEST_WORKSHOP.appId,
    visibility: 0,
    ...overrides
  }
}

export function createUploadDraft(overrides: Partial<UploadDraft> = {}): UploadDraft {
  return {
    appId: TEST_WORKSHOP.appId,
    contentFolder: TEST_WORKSHOP.contentFolder,
    previewFile: '',
    title: 'Test Upload',
    changenote: '',
    ...overrides
  }
}
