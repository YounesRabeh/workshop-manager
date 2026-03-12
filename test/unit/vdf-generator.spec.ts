import { describe, expect, it } from 'vitest'
import { generateWorkshopVdf } from '../../src/backend/services/vdf-generator'

describe('generateWorkshopVdf', () => {
  it('renders deterministic upload VDF with escaped values', () => {
    const output = generateWorkshopVdf(
      {
        appId: '480',
        contentFolder: '/mods/base',
        previewFile: '/mods/preview.png',
        title: 'My "Quoted" Mod',
        description: 'Line 1\nLine 2',
        tags: ['fun', 'coop']
      },
      'upload'
    )

    expect(output).toContain('"appid"\t"480"')
    expect(output).toContain('"title"\t"My \\"Quoted\\" Mod"')
    expect(output).toContain('"description"\t"Line 1\\nLine 2"')
    expect(output).toContain('"fun"\t"1"')
    expect(output).not.toContain('publishedfileid')
  })

  it('requires publishedfileid for update mode', () => {
    expect(() =>
      generateWorkshopVdf(
        {
          appId: '480',
          contentFolder: '/mods/base',
          previewFile: '/mods/preview.png',
          title: 'Test',
          description: 'Test',
          tags: []
        },
        'update'
      )
    ).toThrowError(/publishedfileid/i)
  })

  it('omits optional preview and description fields when empty', () => {
    const output = generateWorkshopVdf(
      {
        appId: '480',
        contentFolder: '/mods/base',
        previewFile: '',
        title: 'No Optional Fields',
        description: '',
        tags: []
      },
      'upload'
    )

    expect(output).toContain('"title"\t"No Optional Fields"')
    expect(output).not.toContain('"previewfile"')
    expect(output).not.toContain('"description"')
  })

  it('includes changenote for update mode when provided', () => {
    const output = generateWorkshopVdf(
      {
        appId: '480',
        publishedFileId: '12345',
        contentFolder: '/mods/base',
        title: 'Update Target',
        changenote: 'Balance tweaks and crash fixes',
        tags: []
      },
      'update'
    )

    expect(output).toContain('"publishedfileid"\t"12345"')
    expect(output).toContain('"changenote"\t"Balance tweaks and crash fixes"')
  })
})
