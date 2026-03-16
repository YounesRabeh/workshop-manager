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
        tags: ['fun', 'coop']
      },
      'upload'
    )

    expect(output).toContain('"appid"\t"480"')
    expect(output).toContain('"title"\t"My \\"Quoted\\" Mod"')
    expect(output).toContain('"0"\t"fun"')
    expect(output).toContain('"1"\t"coop"')
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
          tags: []
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
        title: 'No Optional Fields',
        tags: []
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
        changenote: 'Balance tweaks and crash fixes',
        tags: []
      },
      'update'
    )

    expect(output).toContain('"publishedfileid"\t"12345"')
    expect(output).toContain('"changenote"\t"Balance tweaks and crash fixes"')
    expect(output).toContain('"contentfolder"\t"/mods/base"')
  })

  it('preserves changenote line breaks for update mode', () => {
    const output = generateWorkshopVdf(
      {
        appId: '480',
        publishedFileId: '12345',
        contentFolder: '/mods/base',
        title: 'Update Target',
        changenote: 'line one\nline two',
        tags: []
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
        title: 'Update Target',
        tags: []
      },
      'update'
    )

    expect(output).toContain('"publishedfileid"\t"12345"')
    expect(output).toContain('"previewfile"\t"/mods/new-preview.png"')
    expect(output).not.toContain('"contentfolder"')
  })

  it('emits empty tags block when update explicitly requests tag sync', () => {
    const output = generateWorkshopVdf(
      {
        appId: '480',
        publishedFileId: '12345',
        contentFolder: '',
        previewFile: '/mods/new-preview.png',
        title: 'Update Target',
        tags: [],
        forceTagsUpdate: true
      },
      'update'
    )

    expect(output).toContain('"publishedfileid"\t"12345"')
    expect(output).toContain('"tags"')
    expect(output).toContain('\t"tags"\n\t{\n\t}')
  })

  it('emits visibility-only VDF structure', () => {
    const output = generateWorkshopVdf(
      {
        appId: '480',
        publishedFileId: '12345',
        contentFolder: '',
        title: '',
        tags: [],
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

  it('splits and deduplicates tags before generating VDF', () => {
    const output = generateWorkshopVdf(
      {
        appId: '480',
        contentFolder: '/mods/base',
        previewFile: '/mods/preview.png',
        title: 'My Mod',
        tags: ['fun, coop', 'coop', 'PVP ; Builder', '  builder  ']
      },
      'upload'
    )

    expect(output).toContain('"0"\t"fun"')
    expect(output).toContain('"1"\t"coop"')
    expect(output).toContain('"2"\t"PVP"')
    expect(output).toContain('"3"\t"Builder"')
    expect((output.match(/\"coop\"/g) ?? []).length).toBe(1)
    expect((output.match(/\"Builder\"/g) ?? []).length).toBe(1)
  })
})
