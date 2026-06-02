// AUTH-CLEANUP (BUG-QA-04) — wipe every coach-scoped sessionStorage cache
// before redirecting the user away from their authenticated session.
//
// Without this, signing out and signing back in as a different coach in the
// same browser tab leaves the previous coach's data in sessionStorage. The
// next reader (e.g. CoachLayoutClient's fetchCoachProfileCached on mount)
// hands back the stale value before any network round-trip — surfacing the
// prior coach's `is_profile_live`, `slug`, completeness flags, etc.
//
// Cache keys are duplicated as string literals here rather than imported from
// their owning modules. Importing from component files (ShareCardModal,
// ProgrammesManagement) into a lib helper would create a component → lib
// → component cycle that bundlers tend to resolve in confusing ways. Direct
// removeItem calls are a safety net, not a critical data path — drift between
// owner and cleanup is acceptable and easy to spot on grep.
//
// Lib-resident keys (onboarding-cache, stripe-status-cache, profile-
// completeness-cache) ARE invalidated through their exported helpers so the
// canonical sites stay authoritative for their own state.

import { clearCoachProfileCache, clearCoachSportsCache } from './onboarding-cache'
import { clearStripeStatusCache } from './stripe-status-cache'
import { clearProfileCompletenessCache } from './profile-completeness-cache'

/** Component-owned cache keys cleared via direct removeItem (see file header). */
const COMPONENT_OWNED_KEYS: readonly string[] = [
  'crikly:coach-share-meta', // ShareCardModal.tsx
  'crikly:programmes',       // ProgrammesManagement.tsx
] as const

/**
 * Clear every coach-scoped sessionStorage cache so the next authenticated
 * user on this browser tab cannot read prior coach state. Safe to call
 * even if sessionStorage is unavailable (private mode etc.) — all callees
 * swallow their own errors.
 */
export function clearAllCoachCaches(): void {
  // Lib-resident caches — go through their owning module so behaviour stays
  // consistent with other invalidation sites.
  clearCoachProfileCache()
  clearCoachSportsCache()
  clearStripeStatusCache()
  clearProfileCompletenessCache()

  // Component-owned caches — direct removeItem, single try/catch.
  try {
    for (const key of COMPONENT_OWNED_KEYS) {
      sessionStorage.removeItem(key)
    }
  } catch {
    // sessionStorage unavailable — no-op
  }
}
