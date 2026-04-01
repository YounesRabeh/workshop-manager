import { describe, expect, it } from 'vitest'
import { generateWorkshopVdf } from '../../src/backend/services/vdf-generator'

describe('generateWorkshopVdf', () => {
  it('renders deterministic upload VDF with escaped values', () => {
    const output = generateWorkshopVdf(
      {
        appId: '480',
        contentFolder: '/mods/base',
        previewFile: '/mods/preview.png',
        title: 'My "Quoted" Mod'
      },
      'upload'
    )

    expect(output).toContain('"appid"\t"480"')
    expect(output).toContain('"title"\t"My \\"Quoted\\" Mod"')
    expect(output).not.toContain('publishedfileid')
    expect(output).not.toContain('"tags"')
  })

  it('requires publishedfileid for update mode', () => {
    expect(() =>
      generateWorkshopVdf(
        {
          appId: '480',
          contentFolder: '/mods/base',
          previewFile: '/mods/preview.png',
          title: 'Test'
        },
        'update'
      )
    ).toThrowError(/publishedfileid/i)
  })

  it('omits optional preview fields when empty', () => {
    const output = generateWorkshopVdf(
        {
          appId: '480',
          contentFolder: '/mods/base',
          previewFile: '',
          title: 'No Optional Fields'
        },
        'upload'
      )

    expect(output).toContain('"title"\t"No Optional Fields"')
    expect(output).not.toContain('"previewfile"')
  })

  it('includes changenote for update mode when provided', () => {
    const output = generateWorkshopVdf(
      {
        appId: '480',
        publishedFileId: '12345',
        contentFolder: '/mods/base',
        title: 'Update Target',
        changenote: 'Balance tweaks and crash fixes'
      },
      'update'
    )

    expect(output).toContain('"publishedfileid"\t"12345"')
    expect(output).toContain('"changenote"\t"Balance tweaks and crash fixes"')
    expect(output).toContain('"contentfolder"\t"/mods/base"')
  })

  it('includes changenote for upload mode when provided', () => {
    const output = generateWorkshopVdf(
      {
        appId: '480',
        contentFolder: '/mods/base',
        previewFile: '/mods/preview.png',
        title: 'New Upload',
        changenote: 'Initial release'
      },
      'upload'
    )

    expect(output).toContain('"changenote"\t"Initial release"')
  })

  it('preserves changenote line breaks for update mode', () => {
    const output = generateWorkshopVdf(
      {
        appId: '480',
        publishedFileId: '12345',
        contentFolder: '/mods/base',
        title: 'Update Target',
        changenote: 'line one\nline two'
      },
      'update'
    )

    expect(output).toContain('"changenote"\t"line one\nline two"')
    expect(output).not.toContain('"changenote"\t"line one\\nline two"')
  })

  it('supports preview-only update without contentfolder', () => {
    const output = generateWorkshopVdf(
      {
        appId: '480',
        publishedFileId: '12345',
        contentFolder: '',
        previewFile: '/mods/new-preview.png',
        title: 'Update Target'
      },
      'update'
    )

    expect(output).toContain('"publishedfileid"\t"12345"')
    expect(output).toContain('"previewfile"\t"/mods/new-preview.png"')
    expect(output).not.toContain('"contentfolder"')
  })

  it('emits visibility-only VDF structure', () => {
    const output = generateWorkshopVdf(
      {
        appId: '480',
        publishedFileId: '12345',
        contentFolder: '',
        title: '',
        visibility: 2
      },
      'visibility'
    )

    expect(output).toContain('"appid"\t"480"')
    expect(output).toContain('"publishedfileid"\t"12345"')
    expect(output).toContain('"visibility"\t"2"')
    expect(output).not.toContain('"contentfolder"')
    expect(output).not.toContain('"title"')
    expect(output).not.toContain('"tags"')
  })
})
