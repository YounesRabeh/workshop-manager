import { describe, expect, it } from 'vitest'
import { validateDraft } from '@backend/utils/validation'

describe('validateDraft', () => {
  it('rejects create when appId/contentFolder/title are missing', () => {
    expect(() =>
      validateDraft(
        {
          appId: '',
          contentFolder: '',
          previewFile: '',
          title: '',
          changenote: ''
        },
        'upload'
      )
    ).toThrowError(/App ID is required for uploads/i)
  })

  it('lists the remaining missing create fields after App ID passes validation', () => {
    expect(() => validateDraft({ appId: '480', contentFolder: '', title: '' }, 'upload'))
      .toThrowError(/Missing required fields: contentFolder, title/i)
  })

  it('allows create when content folder is present and release notes are empty', () => {
    expect(() =>
      validateDraft(
        {
          appId: '480',
          contentFolder: '/mods/content',
          previewFile: '',
          title: 'Created Title',
          changenote: ''
        },
        'upload'
      )
    ).not.toThrow()
  })

  it('allows update with previewFile only', () => {
    expect(() =>
      validateDraft(
        {
          appId: '480',
          publishedFileId: '123',
          contentFolder: '',
          previewFile: '/mods/preview.png',
          title: 'Updated Title'
        },
        'update'
      )
    ).not.toThrow()
  })

  it('allows update with contentFolder only', () => {
    expect(() =>
      validateDraft(
        {
          appId: '480',
          publishedFileId: '123',
          contentFolder: '/mods/content',
          previewFile: '',
          title: 'Updated Title'
        },
        'update'
      )
    ).not.toThrow()
  })

  it('allows title-only update when contentFolder and previewFile are empty', () => {
    expect(() =>
      validateDraft(
        {
          appId: '480',
          publishedFileId: '123',
          contentFolder: '',
          previewFile: '',
          title: 'Updated Title'
        },
        'update'
      )
    ).not.toThrow()
  })

  it('rejects update when title is empty', () => {
    expect(() =>
      validateDraft(
        {
          appId: '480',
          publishedFileId: '123',
          contentFolder: '',
          previewFile: '',
          title: ''
        },
        'update'
      )
    ).toThrowError(/title is required for updates/i)
  })

  it('requires visibility fields in visibility mode', () => {
    expect(() =>
      validateDraft(
        {
          appId: '',
          publishedFileId: '',
          contentFolder: '',
          title: ''
        },
        'visibility'
      )
    ).toThrowError(/App ID is required for visibility updates/i)
  })

  it('rejects malformed excluded content paths from IPC payloads', () => {
    expect(() =>
      validateDraft(
        {
          appId: '480',
          contentFolder: '/mods/content',
          title: 'Created Title',
          excludedContentPaths: 'secret.txt' as unknown as string[]
        },
        'upload'
      )
    ).toThrowError(/excludedContentPaths must be an array/i)
  })

  it('rejects non-numeric Workshop IDs before SteamCMD runs', () => {
    expect(() => validateDraft({
      appId: 'game-name',
      publishedFileId: 'item-name',
      contentFolder: '',
      title: '',
      visibility: 2
    }, 'visibility')).toThrowError(/App ID must contain digits only/i)
  })

  it('distinguishes a missing update item ID from a malformed one', () => {
    expect(() => validateDraft({ appId: '480', publishedFileId: '', contentFolder: '', title: 'Update' }, 'update'))
      .toThrowError(/Published file ID is required for updates/i)
    expect(() => validateDraft({ appId: '480', publishedFileId: 'item-name', contentFolder: '', title: 'Update' }, 'update'))
      .toThrowError(/Published file ID must contain digits only/i)
  })
})
