import { describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)))

describe('frontend publish structure', () => {
  it('keeps canonical publish components under components/publish', () => {
    expect(
      existsSync(
        resolve(root, 'src/frontend/components/publish/CreatePublishSection.vue')
      )
    ).toBe(true)
    expect(
      existsSync(
        resolve(root, 'src/frontend/components/publish/UpdatePublishSection.vue')
      )
    ).toBe(true)
    expect(
      existsSync(
        resolve(root, 'src/frontend/components/publish/publish-section.shared.ts')
      )
    ).toBe(true)
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
