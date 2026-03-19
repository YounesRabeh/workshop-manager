import type { UploadDraft } from '@shared/contracts'
import { AppError } from '@backend/utils/errors'

function escapeVdf(value: string, preserveNewlines = false): string {
  const normalized = value.replace(/\r\n/g, '\n')
  const escaped = normalized.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  if (preserveNewlines) {
    return escaped
  }
  return escaped.replace(/\n/g, '\\n')
}

function assertString(name: string, value: string | undefined): string {
  if (!value || value.trim().length === 0) {
    throw new AppError('validation', `${name} is required`)
  }
  return value.trim()
}

function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>()
  const normalized: string[] = []

  for (const tag of tags) {
    const parts = tag.split(/[;,]/g)
    for (const rawPart of parts) {
      const part = rawPart.trim()
      if (!part) {
        continue
      }
      const dedupeKey = part.toLowerCase()
      if (seen.has(dedupeKey)) {
        continue
      }
      seen.add(dedupeKey)
      normalized.push(part)
    }
  }

  return normalized
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

  const trimmedContentFolder = draft.contentFolder?.trim()
  const previewFile = draft.previewFile?.trim()
  const title = mode === 'upload' ? assertString('title', draft.title) : draft.title?.trim()
  const changeNote = draft.changenote?.trim()

  const tagsList = normalizeTags(draft.tags)
  const tagsBlock = tagsList.map((tag, index) => `\t\t\"${index}\"\t\"${escapeVdf(tag)}\"`).join('\n')

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

  const lines = [...headerLines]

  if (mode === 'upload') {
    lines.push(`\t\"contentfolder\"\t\"${escapeVdf(assertString('contentfolder', draft.contentFolder))}\"`)
  } else if (trimmedContentFolder) {
    lines.push(`\t\"contentfolder\"\t\"${escapeVdf(trimmedContentFolder)}\"`)
  }

  if (previewFile) {
    lines.push(`\t\"previewfile\"\t\"${escapeVdf(previewFile)}\"`)
  }

  if (title) {
    lines.push(`\t\"title\"\t\"${escapeVdf(title)}\"`)
  }

  if (changeNote) {
    lines.push(`\t\"changenote\"\t\"${escapeVdf(changeNote, true)}\"`)
  }

  const shouldWriteTags = tagsList.length > 0 || (mode === 'update' && draft.forceTagsUpdate === true)

  if (shouldWriteTags) {
    lines.push('\t"tags"', '\t{', tagsBlock, '\t}')
  }

  lines.push('}')

  return `${lines.filter((line) => line !== '').join('\n')}\n`
}
