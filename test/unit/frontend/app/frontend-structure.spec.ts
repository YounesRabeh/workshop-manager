import { describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('../../../../', import.meta.url)))

describe('frontend publish structure', () => {
  it('keeps publish feature grouped under components/publish subfolders', () => {
    expect(
      existsSync(
        resolve(root, 'src/frontend/components/publish/sections/CreatePublishSection.vue')
      )
    ).toBe(true)
    expect(
      existsSync(
        resolve(root, 'src/frontend/components/publish/sections/UpdatePublishSection.vue')
      )
    ).toBe(true)
    expect(
      existsSync(
        resolve(root, 'src/frontend/components/publish/composables/useContentExplorer.ts')
      )
    ).toBe(true)
    expect(
      existsSync(
        resolve(root, 'src/frontend/components/publish/composables/useUploadPreview.ts')
      )
    ).toBe(true)
    expect(
      existsSync(
        resolve(root, 'src/frontend/components/publish/model/visibility.ts')
      )
    ).toBe(true)
    expect(
      existsSync(
        resolve(root, 'src/frontend/components/publish/theme/visibility-theme.ts')
      )
    ).toBe(true)
    expect(
      existsSync(
        resolve(root, 'src/frontend/components/publish/panels/PublishReadinessCard.vue')
      )
    ).toBe(true)
    expect(
      existsSync(
        resolve(root, 'src/frontend/components/publish/panels/PublishUpdateOverviewCard.vue')
      )
    ).toBe(true)
    expect(
      existsSync(
        resolve(root, 'src/frontend/components/publish/styles/publish-section.shared.css')
      )
    ).toBe(true)
  })

  it('removes legacy flat files under components/publish', () => {
    expect(
      existsSync(resolve(root, 'src/frontend/components/publish/CreatePublishSection.vue'))
    ).toBe(false)
    expect(
      existsSync(resolve(root, 'src/frontend/components/publish/UpdatePublishSection.vue'))
    ).toBe(false)
    expect(
      existsSync(resolve(root, 'src/frontend/components/publish/publish-section.shared.ts'))
    ).toBe(false)
    expect(
      existsSync(resolve(root, 'src/frontend/components/publish/shared/index.ts'))
    ).toBe(false)
  })

  it('removes legacy top-level publish compatibility files', () => {
    expect(
      existsSync(resolve(root, 'src/frontend/components/PublishSection.vue'))
    ).toBe(false)
    expect(
      existsSync(resolve(root, 'src/frontend/components/CreatePublishSection.vue'))
    ).toBe(false)
    expect(
      existsSync(resolve(root, 'src/frontend/components/UpdatePublishSection.vue'))
    ).toBe(false)
    expect(
      existsSync(resolve(root, 'src/frontend/components/publish-section.shared.ts'))
    ).toBe(false)
  })
})
