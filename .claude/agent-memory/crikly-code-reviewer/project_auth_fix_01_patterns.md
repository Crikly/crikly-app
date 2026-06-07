---
name: Project — AUTH-FIX-01 auth gate patterns
description: Confirmed safe and flagged patterns from the AUTH-FIX-01 security commit (RBAC fix, coach layout gate, accept-terms route, login redirect)
type: project
---

## Confirmed Safe Patterns

- `proxy.ts` is the Next 16 rename of `middleware.ts`. It is the session-only gate protecting `/coach`, `/dashboard`, `/onboarding`, `/parent`, `/player`, `/admin`, `/account`. The brief confirms this was pre-existing and is correct — do not flag `getSession()` usage in proxy.ts as an in-scope issue for reviews that don't touch that file.
- `coach/layout.tsx` 5-step server-side gate (auth → user_profile → role → coach_profile → terms) is approved by Lasith. Order is intentional: terms gate fires last because a coach without a profile row is bounced to onboarding before they can reach any terms-gated surface.
- `createClient` from `@/lib/supabase/server` in layout files is correct for server components — uses cookie-bound anon client (RLS applies). Not a service-role bypass.
- `console.info` in `e2e/fixtures/seed.ts` is a confirmed safe pattern (E2E tooling, not production path).
- `SUPABASE_SERVICE_ROLE_KEY` in `e2e/fixtures/seed.ts` is confirmed safe — it is an E2E seed script not bundled into the app.
- Login route 4-branch redirect order (terms → coach → role-exists → role-missing) is Lasith-approved. The edge case where a user with no role + no terms lands at /onboarding/terms is intentional per brief.

## Flagged Patterns to Watch

- **Supabase PostgREST silent zero-row UPDATE**: `UPDATE ... WHERE auth_user_id = user.id` returns `{ error: null }` even when 0 rows match. Always add a row-count check (`.select('id').single()` after update, or check `count` option) when writing to user_profiles via accept-terms or similar routes. First flagged in `accept-terms/route.ts` FIX B.
- **Login route null-profile branch**: If `user_profiles` row is missing entirely, `!userProfile?.terms_accepted_at` fires and routes to `/onboarding/terms` instead of returning an error. Latent but tolerable since login flow always creates the profile row first.
- **T7.3 parent test**: Uses `TEST_PARENT_EMAIL/TEST_PARENT_PASSWORD` env vars — this test is always skipped in CI unless those vars are set. This is by design; flag if the test is ever promoted to required.

## File Locations

- `src/proxy.ts` — Next 16 middleware (session + role-unaware, unauthenticated redirect only)
- `src/app/coach/layout.tsx` — 5-step server-side coach gate
- `src/app/api/auth/accept-terms/route.ts` — terms acceptance writer
- `src/app/api/auth/login/route.ts` — 4-branch post-login redirect
- `e2e/p7-rbac.spec.ts` — RBAC negative-path tests
- `e2e/fixtures/seed.ts` — now includes `terms_accepted_at: now` (required since AUTH-FIX-01)
