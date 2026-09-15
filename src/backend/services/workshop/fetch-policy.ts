/**
 * Overview: Defines limits for remote Workshop metadata requests.
 * Responsibility: Keeps network timeouts, pagination bounds, and details-request batch sizes
 * in one validated policy shared by Workshop fetch services.
 */
export interface WorkshopFetchPolicy {
  requestTimeoutMs: number
  maxCommunityPages: number
  maxWebApiPages: number
  detailsBatchSize: number
}

export const DEFAULT_WORKSHOP_FETCH_POLICY: Readonly<WorkshopFetchPolicy> = Object.freeze({
  requestTimeoutMs: 15_000,
  maxCommunityPages: 50,
  maxWebApiPages: 20,
  // Steam's details endpoint accepts batches of up to 100 IDs.
  detailsBatchSize: 100
})

export function resolveWorkshopFetchPolicy(overrides: Partial<WorkshopFetchPolicy>): WorkshopFetchPolicy {
  const policy = { ...DEFAULT_WORKSHOP_FETCH_POLICY, ...overrides }
  for (const [key, value] of Object.entries(policy)) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new RangeError(`${key} must be a positive safe integer`)
    }
  }
  if (policy.detailsBatchSize > 100) throw new RangeError('detailsBatchSize must not exceed 100')
  return policy
}
