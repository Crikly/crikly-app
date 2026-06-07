// PERF-03: 60s TTL cache for /api/payments/connect/onboard GET response.
//
// Stripe's accounts.retrieve() takes ~800ms per call. Without a cache,
// every GetPaid page mount (including React strict-mode double-invoke
// in dev) pays that cost. With a 60s TTL the steady-state cost drops
// to ~0ms after the first load, and the cache busts itself naturally
// without needing manual invalidation everywhere.
//
// Pattern mirrors src/lib/onboarding-cache.ts (try/catch around
// sessionStorage; fall through to network on any failure). Adds a
// timestamp gate for TTL — onboarding-cache.ts uses infinite-TTL with
// manual invalidation, which would be wrong here (Stripe status can
// change server-side via webhooks at any time).
//
// MUST be invalidated explicitly via clearStripeStatusCache() after
// any flow that mutates Stripe state — currently just the return-from-
// onboarding redirect (success=true / refresh=true query params).

export interface StripeConnectStatus {
  connected: boolean
  charges_enabled?: boolean
  payouts_enabled?: boolean
  details_submitted?: boolean
}

const CACHE_KEY = 'crikly:stripe-status'
const TTL_MS = 60 * 1000 // 60 seconds

interface CachedEntry {
  value: StripeConnectStatus
  storedAt: number
}

export function readStripeStatusCache(): StripeConnectStatus | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedEntry
    // Defensive: if storedAt is missing/corrupt (legacy entry, schema drift),
    // treat as a miss. Without this guard, `Date.now() - undefined = NaN`,
    // and `NaN > TTL_MS = false`, which would serve a stale value forever.
    if (!Number.isFinite(parsed.storedAt)) return null
    if (Date.now() - parsed.storedAt > TTL_MS) return null
    return parsed.value
  } catch {
    // sessionStorage unavailable or JSON malformed — fall through to network
    return null
  }
}

export function writeStripeStatusCache(value: StripeConnectStatus): void {
  try {
    const entry: CachedEntry = { value, storedAt: Date.now() }
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(entry))
  } catch {
    // sessionStorage write failed — non-critical, the next call will refetch
  }
}

export function clearStripeStatusCache(): void {
  try {
    sessionStorage.removeItem(CACHE_KEY)
  } catch {
    // sessionStorage unavailable — no cache to clear, no-op
  }
}
