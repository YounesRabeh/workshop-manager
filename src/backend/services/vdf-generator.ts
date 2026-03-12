import type { UploadDraft } from '@shared/contracts'
import { AppError } from '@backend/utils/errors'

function escapeVdf(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '\\n')
}

function assertString(name: string, value: string | undefined): string {
  if (!value || value.trim().length === 0) {
    throw new AppError('validation', `${name} is required`)
  }
  return value.trim()
}

export function generateWorkshopVdf(draft: UploadDraft, mode: 'upload' | 'update' | 'visibility'): string {
  const appId = assertString('appid', draft.appId)
  const hasVisibility = draft.visibility !== undefined

  if ((mode === 'update' || mode === 'visibility') && !draft.publishedFileId?.trim()) {
    throw new AppError('validation', 'publishedfileid is required for update/visibility mode')
  }

  if (mode === 'visibility') {
    if (!hasVisibility || ![0, 1, 2, 3].includes(draft.visibility!)) {
      throw new AppError('validation', 'visibility is required for visibility mode')
    }

    const lines = [
      '"workshopitem"',
      '{',
      `\t\"appid\"\t\"${escapeVdf(appId)}\"`,
      `\t\"publishedfileid\"\t\"${escapeVdf(draft.publishedFileId ?? '')}\"`,
      `\t\"visibility\"\t\"${String(draft.visibility)}\"`,
      '}'
    ]
    return `${lines.join('\n')}\n`
  }

  const contentFolder = assertString('contentfolder', draft.contentFolder)
  const previewFile = draft.previewFile?.trim()
  const title = assertString('title', draft.title)
  const description = draft.description?.trim()
  const changeNote = draft.changenote?.trim()

  const tagsBlock = draft.tags
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) => `\t\t\"${escapeVdf(tag)}\"\t\"1\"`)
    .join('\n')

  const headerLines = [
    '"workshopitem"',
    '{',
    `\t\"appid\"\t\"${escapeVdf(appId)}\"`
  ]

  if (mode === 'update') {
    headerLines.push(`\t\"publishedfileid\"\t\"${escapeVdf(draft.publishedFileId ?? '')}\"`)
  }

  if (hasVisibility) {
    if (![0, 1, 2, 3].includes(draft.visibility!)) {
      throw new AppError('validation', 'visibility must be one of: 0, 1, 2, 3')
    }
    headerLines.push(`\t\"visibility\"\t\"${String(draft.visibility)}\"`)
  }

  const lines = [
    ...headerLines,
    `\t\"contentfolder\"\t\"${escapeVdf(contentFolder)}\"`,
    ...(previewFile ? [`\t\"previewfile\"\t\"${escapeVdf(previewFile)}\"`] : []),
    `\t\"title\"\t\"${escapeVdf(title)}\"`,
    ...(description ? [`\t\"description\"\t\"${escapeVdf(description)}\"`] : []),
    ...(mode === 'update' && changeNote ? [`\t\"changenote\"\t\"${escapeVdf(changeNote)}\"`] : []),
    '\t"tags"',
    '\t{',
    tagsBlock,
    '\t}',
    '}'
  ]

  return `${lines.filter((line) => line !== '').join('\n')}\n`
}
