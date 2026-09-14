import { describe, expect, it } from 'vitest'
import { resolveWorkshopFetchPolicy } from '@backend/services/workshop/fetch-policy'

describe('Workshop fetch policy', () => {
  it('accepts explicit limits and rejects invalid request budgets', () => {
    expect(resolveWorkshopFetchPolicy({ maxCommunityPages: 3 }).maxCommunityPages).toBe(3)
    for (const maxCommunityPages of [0, -1, Infinity, NaN, 1.5]) {
      expect(() => resolveWorkshopFetchPolicy({ maxCommunityPages })).toThrow(RangeError)
    }
    expect(() => resolveWorkshopFetchPolicy({ detailsBatchSize: 101 })).toThrow(RangeError)
  })
})
