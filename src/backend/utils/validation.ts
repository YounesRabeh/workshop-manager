import type { UploadDraft } from '@shared/contracts'
import { AppError } from './errors'

const REQUIRED_FIELDS: Array<keyof UploadDraft> = [
  'appId',
  'contentFolder',
  'title'
]

export function validateDraft(draft: UploadDraft, mode: 'upload' | 'update' | 'visibility'): void {
  if (draft.visibility !== undefined && ![0, 1, 2, 3].includes(draft.visibility)) {
    throw new AppError('validation', 'visibility must be one of: 0, 1, 2, 3')
  }

  if (mode === 'visibility') {
    if (typeof draft.appId !== 'string' || draft.appId.trim().length === 0) {
      throw new AppError('validation', 'appId is required for visibility updates')
    }
    if (typeof draft.publishedFileId !== 'string' || draft.publishedFileId.trim().length === 0) {
      throw new AppError('validation', 'publishedFileId is required for visibility updates')
    }
    if (draft.visibility === undefined) {
      throw new AppError('validation', 'visibility is required for visibility updates')
    }
    return
  }

  const missing = REQUIRED_FIELDS.filter((field) => {
    const value = draft[field]
    return typeof value !== 'string' || value.trim().length === 0
  })

  if (missing.length > 0) {
    throw new AppError('validation', `Missing required fields: ${missing.join(', ')}`)
  }

  if (mode === 'update' && !draft.publishedFileId?.trim()) {
    throw new AppError('validation', 'publishedFileId is required for updates')
  }

  if (!Array.isArray(draft.tags)) {
    throw new AppError('validation', 'tags must be an array')
  }
}
