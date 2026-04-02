import { describe, expect, it, vi, beforeEach } from 'vitest'
import { AppError } from '@backend/utils/errors'
import { WorkshopFetchService } from '@backend/services/workshop-fetch-service'

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

  it('throws explicit auth error when login succeeded but steam identity is unresolved', async () => {
    const service = new WorkshopFetchService({
      getLoginState: () => ({
        username: 'Alice'
      })
    })

    await expect(
      service.getMyWorkshopItems(undefined, undefined, {
        allowWebApi: false,
        webApiAccess: 'configured_unavailable'
      })
    ).rejects.toMatchObject({
      code: 'auth',
      message: expect.stringContaining('account identity could not be resolved')
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

    const items = await service.getMyWorkshopItems(undefined, undefined, { allowWebApi: false })
    expect(items).toEqual([])
  })

  it('continues fetching community pages beyond page ten and batches details requests', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url

      if (url.includes('/myworkshopfiles/')) {
        const parsed = new URL(url)
        const page = Number(parsed.searchParams.get('p') ?? '1')

        if (page === 1) {
          return new Response(
            '<a href="?p=12">12</a><a href="https://steamcommunity.com/sharedfiles/filedetails/?id=100">First</a>',
            { status: 200, headers: { 'content-type': 'text/html' } }
          )
        }

        if (page === 12) {
          return new Response(
            '<a href="https://steamcommunity.com/sharedfiles/filedetails/?id=200">Twelfth</a>',
            { status: 200, headers: { 'content-type': 'text/html' } }
          )
        }

        return new Response('<html><body></body></html>', {
          status: 200,
          headers: { 'content-type': 'text/html' }
        })
      }

      if (url === 'https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/') {
        const params = new URLSearchParams(String(init?.body ?? ''))
        const ids = [...params.entries()]
          .filter(([key]) => key.startsWith('publishedfileids['))
          .map(([, value]) => value)

        return new Response(
          JSON.stringify({
            response: {
              publishedfiledetails: ids.map((id, index) => ({
                publishedfileid: id,
                title: `Item ${id}`,
                consumer_appid: '480',
                time_updated: index + 1
              }))
            }
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' }
          }
        )
      }

      throw new Error(`Unexpected fetch url: ${url}`)
    })

    const service = new WorkshopFetchService({
      getLoginState: () => ({
        username: 'Alice',
        steamId64: '76561198000000000'
      })
    })

    const items = await service.getMyWorkshopItems(undefined, undefined, { allowWebApi: false })

    expect(items.map((item) => item.publishedFileId).sort()).toEqual(['100', '200'])
    expect(
      fetchSpy.mock.calls.some(([input]) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
        return url.includes('p=12')
      })
    ).toBe(true)
  })
})
