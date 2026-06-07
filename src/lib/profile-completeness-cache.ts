// API-CMD-CENTRE: 60s TTL sessionStorage cache for /api/coaches/profile-completeness.
// Mirrors the stripe-status-cache pattern (TTL gate + corrupt-entry guard +
// write-fail no-op). Short TTL lets us skip explicit invalidation — when the
// coach adds a sport/availability slot and navigates back, at most 60s of
// staleness shows before the next mount refetches.
//
// Extracted from CoachRightPanel.tsx during BUG-QA-04 so the key is reachable
// from src/lib/auth-cleanup.ts without a component → lib import cycle.

const CACHE_KEY = 'crikly:profile-completeness'
const TTL_MS = 60 * 1000

export interface ProfileCompleteness {
  sports: boolean
  qualifications: boolean
  availability: boolean
  unanswered_reviews: number
}

interface CacheEntry {
  value: ProfileCompleteness
  storedAt: number
}

export function readProfileCompletenessCache(): ProfileCompleteness | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CacheEntry
    if (!Number.isFinite(parsed.storedAt)) return null
    if (Date.now() - parsed.storedAt > TTL_MS) return null
    return parsed.value
  } catch {
    return null
  }
}

export function writeProfileCompletenessCache(value: ProfileCompleteness): void {
  try {
    const entry: CacheEntry = { value, storedAt: Date.now() }
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(entry))
  } catch {
    // sessionStorage write failed — non-critical
  }
}

export function clearProfileCompletenessCache(): void {
  try {
    sessionStorage.removeItem(CACHE_KEY)
  } catch {
    // sessionStorage unavailable — no cache to clear, no-op
  }
}
