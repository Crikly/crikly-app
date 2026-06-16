// AF-P-01: shared onboarding fetch caches.
//
// /api/coaches/profile is consumed by all 6 onboarding steps and was previously
// fetched independently 6× per onboarding pass. /api/sports is consumed by
// SportStep + PricingStep and was cached only by SportStep. These helpers
// dedupe both via sessionStorage so each endpoint hits the network at most
// once per onboarding pass.
//
// Cache invalidation:
//   clearCoachProfileCache() — call from any handleSave that mutates
//     coach_profiles (ProfileStep + BookingPolicyStep).
//   clearCoachSportsCache() — call from any handleSave that mutates
//     coach_sports (PricingStep, the only writer in onboarding).
//   clearSessionTypesCache() — call wherever session types / pricing change
//     (PricingStep save). Any future coach_session_types writer must call it too.
//   Other steps leave caches warm.
//
// All sessionStorage access is wrapped in try/catch — sessionStorage throws
// in private/incognito modes. On any failure we fall through to the network
// path; the cache is a perf optimisation, never a correctness requirement.

const COACH_PROFILE_KEY = 'coach_profile_cache'
const SPORTS_LIST_KEY = 'sports_list_raw'
const COACH_SPORTS_KEY = 'coach_sports_cache'
const SESSION_TYPES_KEY = 'session_types_cache'

export async function fetchCoachProfileCached() {
  try {
    const cached = sessionStorage.getItem(COACH_PROFILE_KEY)
    if (cached) return JSON.parse(cached)
  } catch {
    // sessionStorage unavailable — fall through to network
  }

  const resp = await fetch('/api/coaches/profile')
  if (!resp.ok) throw new Error('Failed to fetch profile')
  const data = await resp.json()

  try {
    sessionStorage.setItem(COACH_PROFILE_KEY, JSON.stringify(data))
  } catch {
    // sessionStorage write failed — non-critical, return data anyway
  }
  return data
}

export async function fetchSportsListCached() {
  try {
    const cached = sessionStorage.getItem(SPORTS_LIST_KEY)
    if (cached) return JSON.parse(cached)
  } catch {
    // fall through to network
  }

  const resp = await fetch('/api/sports')
  if (!resp.ok) throw new Error('Failed to fetch sports')
  const data = await resp.json()
  const rawSports = data.sports || []

  try {
    sessionStorage.setItem(SPORTS_LIST_KEY, JSON.stringify(rawSports))
  } catch {
    // non-critical
  }
  return rawSports
}

export async function fetchCoachSportsCached() {
  try {
    const cached = sessionStorage.getItem(COACH_SPORTS_KEY)
    if (cached) return JSON.parse(cached)
  } catch {
    // fall through to network
  }

  const resp = await fetch('/api/coaches/sports')
  if (!resp.ok) throw new Error('Failed to fetch coach sports')
  const data = await resp.json()

  try {
    sessionStorage.setItem(COACH_SPORTS_KEY, JSON.stringify(data))
  } catch {
    // non-critical
  }
  return data
}

export async function fetchSessionTypesCached() {
  try {
    const cached = sessionStorage.getItem(SESSION_TYPES_KEY)
    if (cached) return JSON.parse(cached)
  } catch {
    // fall through to network
  }

  const resp = await fetch('/api/coaches/session-types')
  if (!resp.ok) throw new Error('Failed to fetch session types')
  const data = await resp.json()

  try {
    sessionStorage.setItem(SESSION_TYPES_KEY, JSON.stringify(data))
  } catch {
    // non-critical
  }
  return data
}

export function clearCoachProfileCache() {
  try {
    sessionStorage.removeItem(COACH_PROFILE_KEY)
  } catch {
    // sessionStorage unavailable — no cache to clear, no-op
  }
}

export function clearCoachSportsCache() {
  try {
    sessionStorage.removeItem(COACH_SPORTS_KEY)
  } catch {
    // sessionStorage unavailable — no cache to clear, no-op
  }
}

export function clearSessionTypesCache() {
  try {
    sessionStorage.removeItem(SESSION_TYPES_KEY)
  } catch {
    // sessionStorage unavailable — no cache to clear, no-op
  }
}
