import type { UploadDraft } from '@shared/contracts'
import {
  evaluateCreateRequirements,
  evaluateUpdateRequirements,
  evaluateVisibilityRequirements
} from '@shared/workshop-requirements'
import { AppError } from './errors'

export function validateDraft(draft: UploadDraft, mode: 'upload' | 'update' | 'visibility'): void {
  if (draft.visibility !== undefined && ![0, 1, 2, 3].includes(draft.visibility)) {
    throw new AppError('validation', 'visibility must be one of: 0, 1, 2, 3')
  }

  if (mode === 'visibility') {
    const requirements = evaluateVisibilityRequirements(draft)
    if (!requirements.appId) {
      throw new AppError('validation', 'appId is required for visibility updates')
    }
    if (!requirements.publishedFileId) {
      throw new AppError('validation', 'publishedFileId is required for visibility updates')
    }
    if (!requirements.visibility) {
      throw new AppError('validation', 'visibility is required for visibility updates')
    }
    return
  }

  if (mode === 'upload') {
    const requirements = evaluateCreateRequirements(draft)
    if (requirements.missing.length > 0) {
      throw new AppError('validation', `Missing required fields: ${requirements.missing.join(', ')}`)
    }
  } else {
    const requirements = evaluateUpdateRequirements(draft)
    if (!requirements.appId) {
      throw new AppError('validation', 'appId is required for updates')
    }
    if (!requirements.publishedFileId) {
      throw new AppError('validation', 'publishedFileId is required for updates')
    }
    if (!requirements.title) {
      throw new AppError('validation', 'title is required for updates')
    }
  }

  if (!Array.isArray(draft.tags)) {
    throw new AppError('validation', 'tags must be an array')
  }
}
