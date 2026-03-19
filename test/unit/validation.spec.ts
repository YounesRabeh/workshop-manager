import { describe, expect, it } from 'vitest'
import { validateDraft } from '../../src/backend/utils/validation'

describe('validateDraft', () => {
  it('rejects create when appId/title/releaseNotes are missing', () => {
    expect(() =>
      validateDraft(
        {
          appId: '',
          contentFolder: '',
          previewFile: '',
          title: '',
          releaseNotes: '',
          tags: []
        },
        'upload'
      )
    ).toThrowError(/Missing required fields: appId, title, releaseNotes/i)
  })

  it('allows update with previewFile only', () => {
    expect(() =>
      validateDraft(
        {
          appId: '480',
          publishedFileId: '123',
          contentFolder: '',
          previewFile: '/mods/preview.png',
          title: 'Updated Title',
          tags: []
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
          title: 'Updated Title',
          tags: []
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
          title: 'Updated Title',
          tags: []
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
          title: '',
          tags: []
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
          title: '',
          tags: []
        },
        'visibility'
      )
    ).toThrowError(/appId is required for visibility updates/i)
  })
})
