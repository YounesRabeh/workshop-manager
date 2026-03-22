/**
 * Overview: Shared requirement evaluators for Steam Workshop create, update, and visibility flows.
 * Responsibility: Computes field validity, missing requirements,
 *  and update path shape so frontend and backend enforce consistent draft rules.
 */
export type UpdateDraftPath = 'none' | 'content' | 'preview' | 'content_and_preview'

type RequirementFields = {
  appId?: string
  publishedFileId?: string
  contentFolder?: string
  previewFile?: string
  title?: string
  releaseNotes?: string
  changenote?: string
  visibility?: 0 | 1 | 2 | 3
}

type CreateMissingField = 'appId' | 'contentFolder' | 'title'
type UpdateMissingField = 'appId' | 'publishedFileId' | 'title'
type VisibilityMissingField = 'appId' | 'publishedFileId' | 'visibility'

function hasText(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

function isNumericText(value: string | undefined): boolean {
  return typeof value === 'string' && /^\d+$/.test(value.trim())
}

export function getUpdateDraftPath(fields: RequirementFields): UpdateDraftPath {
  const hasContentFolder = hasText(fields.contentFolder)
  const hasPreviewFile = hasText(fields.previewFile)

  if (hasContentFolder && hasPreviewFile) {
    return 'content_and_preview'
  }
  if (hasContentFolder) {
    return 'content'
  }
  if (hasPreviewFile) {
    return 'preview'
  }
  return 'none'
}

export function evaluateCreateRequirements(fields: RequirementFields): {
  appId: boolean
  contentFolder: boolean
  title: boolean
  valid: boolean
  missing: CreateMissingField[]
} {
  const appId = isNumericText(fields.appId)
  const contentFolder = hasText(fields.contentFolder)
  const title = hasText(fields.title)
  const missing: CreateMissingField[] = []

  if (!appId) {
    missing.push('appId')
  }
  if (!contentFolder) {
    missing.push('contentFolder')
  }
  if (!title) {
    missing.push('title')
  }

  return {
    appId,
    contentFolder,
    title,
    valid: missing.length === 0,
    missing
  }
}

export function evaluateUpdateRequirements(fields: RequirementFields): {
  appId: boolean
  publishedFileId: boolean
  title: boolean
  contentOrPreview: boolean
  updatePath: UpdateDraftPath
  valid: boolean
  missing: UpdateMissingField[]
} {
  const appId = hasText(fields.appId)
  const publishedFileId = hasText(fields.publishedFileId)
  const title = hasText(fields.title)
  const updatePath = getUpdateDraftPath(fields)
  const contentOrPreview = updatePath !== 'none'
  const missing: UpdateMissingField[] = []

  if (!appId) {
    missing.push('appId')
  }
  if (!publishedFileId) {
    missing.push('publishedFileId')
  }
  if (!title) {
    missing.push('title')
  }

  return {
    appId,
    publishedFileId,
    title,
    contentOrPreview,
    updatePath,
    valid: missing.length === 0,
    missing
  }
}

export function evaluateVisibilityRequirements(fields: RequirementFields): {
  appId: boolean
  publishedFileId: boolean
  visibility: boolean
  valid: boolean
  missing: VisibilityMissingField[]
} {
  const appId = hasText(fields.appId)
  const publishedFileId = hasText(fields.publishedFileId)
  const visibility = fields.visibility !== undefined && [0, 1, 2, 3].includes(fields.visibility)
  const missing: VisibilityMissingField[] = []

  if (!appId) {
    missing.push('appId')
  }
  if (!publishedFileId) {
    missing.push('publishedFileId')
  }
  if (!visibility) {
    missing.push('visibility')
  }

  return {
    appId,
    publishedFileId,
    visibility,
    valid: missing.length === 0,
    missing
  }
}
