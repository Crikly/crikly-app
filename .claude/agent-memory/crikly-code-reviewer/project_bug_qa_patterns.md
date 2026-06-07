---
name: Project — BUG-QA-04/02/06 patterns
description: sessionStorage cache contamination fix patterns, programme session synthetic lineup shape, and known gaps from BUG-QA-04/02/06 review
type: project
---

BUG-QA-04 fix: `clearAllCoachCaches()` in `src/lib/auth-cleanup.ts` clears lib-resident caches via their owning helpers and component-owned keys via direct `sessionStorage.removeItem`. Called in settings `handleSignOut` finally block and delete-account flow.

Known gap (flagged as 🟡): `sports_list_raw` (key used by `fetchSportsListCached` in `onboarding-cache.ts`) has NO corresponding `clearSportsListCache()` export and is NOT cleared on logout. A second coach signing in on the same tab could see stale sport name lookups in `CoachRightPanel.sportsMap`. Low-priority but a real drift risk.

BUG-QA-02/06 fix: Programme sessions fetched from `/api/coaches/programme-sessions` and normalised into synthetic `LineupItem` shape. Key field mapping: `booked_by_name = programme_title` (lineup falls back via `child_name ?? booked_by_name`), `coach_price_pence: 0`, `status: 'confirmed'`, `programme_id` set (discriminator). Sport name lookup works via `sport_id` added to API response.

TypeScript narrowing gap (flagged as 🟡): `isProgramme = !!session.programme_id` does NOT narrow `session.programme_id` from `string | undefined` to `string` in the subsequent template literal at `SessionDetailPopup`. Runtime safe (isProgramme=true iff programme_id is truthy) but TypeScript does not narrow through a separate const binding.

`auth-cleanup.ts` intentionally uses hardcoded key strings for component-owned caches (`crikly:coach-share-meta`, `crikly:programmes`) to avoid component→lib→component import cycle. Documented in file header. Reviewed and accepted.

**Why:** BUG-QA-04 root cause was sessionStorage not being user-scoped; BUG-QA-02/06 root cause was programme sessions not being in BookingsContext.
**How to apply:** In future reviews of cache-related code, check that ALL sessionStorage keys used by coach-scope lib helpers are covered by the cleanup function. In particular watch for `sports_list_raw` gap if `clearSportsListCache` is ever added.
