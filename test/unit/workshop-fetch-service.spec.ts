import { describe, expect, it, vi, beforeEach } from 'vitest'
import { AppError } from '../../src/backend/utils/errors'
import { WorkshopFetchService } from '../../src/backend/services/workshop-fetch-service'

describe('WorkshopFetchService', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('throws auth error when not logged in', async () => {
    const service = new WorkshopFetchService({
      getLoginState: () => null
    })

    await expect(service.getCurrentProfile()).rejects.toMatchObject({
      code: 'auth'
    } as Partial<AppError>)
  })

  it('falls back to login-state persona when profile fetch fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('network down'))

    const service = new WorkshopFetchService({
      getLoginState: () => ({
        username: 'Alice',
        steamId64: '76561198000000000'
      })
    })

    const profile = await service.getCurrentProfile()
    expect(profile.personaName).toBe('Alice')
    expect(profile.steamId64).toBe('76561198000000000')
    expect(profile.profileUrl).toContain('/profiles/76561198000000000')
  })

  it('throws auth error when workshop list is requested without login', async () => {
    const service = new WorkshopFetchService({
      getLoginState: () => null
    })

    await expect(service.getMyWorkshopItems()).rejects.toMatchObject({
      code: 'auth'
    } as Partial<AppError>)
  })

  it('returns empty workshop list when community page has no item ids', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      text: async () => '<html><body>No items here</body></html>'
    } as Response)

    const service = new WorkshopFetchService({
      getLoginState: () => ({
        username: 'Alice',
        steamId64: '76561198000000000'
      })
    })

    const items = await service.getMyWorkshopItems(undefined, undefined, false)
    expect(items).toEqual([])
  })
})
