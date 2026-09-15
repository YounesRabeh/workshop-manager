/**
 * Overview: Validates workshop upload/update/visibility drafts before command execution.
 * Responsibility: Enforces mode-specific required fields and visibility constraints using shared requirement evaluators.
 */
import type { UploadDraft } from '@shared/contracts'
import {
  evaluateCreateRequirements,
  evaluateUpdateRequirements,
  evaluateVisibilityRequirements
} from '@shared/workshop-requirements'
import { AppError } from './errors'

function validateNumericId(value: string | undefined, label: string, context: string): void {
  const normalized = value?.trim()
  if (!normalized) {
    throw new AppError('validation', `${label} is required for ${context}.`)
  }
  if (!/^\d+$/.test(normalized)) {
    throw new AppError('validation', `${label} must contain digits only.`)
  }
}

export function validateDraft(draft: UploadDraft, mode: 'upload' | 'update' | 'visibility'): void {
  const excludedContentPaths = draft.excludedContentPaths as unknown
  if (
    excludedContentPaths !== undefined &&
    (!Array.isArray(excludedContentPaths) || excludedContentPaths.some((path) => typeof path !== 'string'))
  ) {
    throw new AppError('validation', 'excludedContentPaths must be an array of relative file paths')
  }

  if (draft.visibility !== undefined && ![0, 1, 2, 3].includes(draft.visibility)) {
    throw new AppError('validation', 'visibility must be one of: 0, 1, 2, 3')
  }

  if (mode === 'visibility') {
    validateNumericId(draft.appId, 'App ID', 'visibility updates')
    validateNumericId(draft.publishedFileId, 'Published file ID', 'visibility updates')
    const requirements = evaluateVisibilityRequirements(draft)
    if (!requirements.visibility) {
      throw new AppError('validation', 'visibility is required for visibility updates')
    }
    return
  }

  if (mode === 'upload') {
    validateNumericId(draft.appId, 'App ID', 'uploads')
    const requirements = evaluateCreateRequirements(draft)
    if (requirements.missing.length > 0) {
      throw new AppError('validation', `Missing required fields: ${requirements.missing.join(', ')}`)
    }
  } else {
    validateNumericId(draft.appId, 'App ID', 'updates')
    validateNumericId(draft.publishedFileId, 'Published file ID', 'updates')
    const requirements = evaluateUpdateRequirements(draft)
    if (!requirements.title) {
      throw new AppError('validation', 'title is required for updates')
    }
  }
}
