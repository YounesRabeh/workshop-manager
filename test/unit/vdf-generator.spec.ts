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
})
