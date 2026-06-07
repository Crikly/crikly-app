---
name: Project — PUB-API-01 public coach discovery patterns
description: Confirmed safe patterns and one latent gap from the public /api/public/coaches endpoint and its RLS migrations (PUB-API-01, 2026-06-03)
type: project
---

**Task:** PUB-API-01 — stateless anon GET /api/public/coaches powering the landing rail and future /coaches discovery page.

**`createPublicClient` pattern (`src/lib/supabase/public.ts`):**
- Uses `createClient` from `@supabase/supabase-js` (NOT the SSR helper) because the route is stateless — no cookies, no auth state, `persistSession: false`, `autoRefreshToken: false`.
- This is correct and intentional. Do not flag as a client mismatch. RLS is still enforced.
- Distinct from: `@/lib/supabase/client` (SSR browser, cookies), `@/lib/supabase/server` (SSR server, cookies), `@/lib/supabase/admin` (service-role, RLS bypass).

**`!` non-null assertions on NEXT_PUBLIC_ env vars:**
- `process.env.NEXT_PUBLIC_SUPABASE_URL!` and `process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!` with `!` is the established codebase pattern across all three Supabase client files.
- Do NOT flag in `public.ts` as a new violation — it is consistent with `client.ts` and `server.ts`.

**`as unknown as CoachSportRow[]` cast in route.ts:**
- Established PostgREST typing escape hatch. Comment references `src/app/api/coaches/profile/route.ts:136-138` as canonical prior use.
- Not a bare `any` — do not flag.

**`sportRow.id as string` (route.ts:175):**
- Redundant cast; `id` is already `string` from generated types. Nice-to-have cleanup only.

**SECURITY DEFINER helper function pattern:**
- `SET search_path = public` — required, pins lookup, blocks malicious search-path injection.
- `REVOKE ALL FROM PUBLIC; GRANT EXECUTE TO anon, authenticated, service_role` — correct privilege model for an RLS helper.
- `STABLE` — correct volatility marker for a deterministic single-query cache.
- Owned by `postgres` (Supabase migration runner) — standard Supabase hosted project pattern.

**Known latent gap — SECURITY DEFINER does not filter suspended/paused/deleted coaches:**
- The helper only gates on `is_profile_live = true`. Coaches with `is_suspended = true`, `is_paused = true`, or `deleted_at IS NOT NULL` (but still `is_profile_live = true`) have their `user_profiles` rows readable by anon.
- Route layer applies all four filters correctly, so nothing leaks through this endpoint.
- Risk is forward-looking: any future public query against `user_profiles` could inadvertently expose suspended/deleted coaches' name/avatar/city.
- Fix: add `is_suspended = false AND is_paused = false AND deleted_at IS NULL` to the helper's EXISTS subquery in a new migration file.
- Filed as should-fix in PUB-API-01 review. Lasith to decide whether to fix immediately or document as accepted risk.

**Over-fetch / JS sort pattern:**
- `OVERFETCH_CAP = 200` rows fetched, sorted in JS (rating_avg DESC NULLS LAST, rating_count DESC, created_at DESC), then paginated.
- Reason: PostgREST `referencedTable` ordering applies to embedded rows, not top-level rows. Can't ORDER BY coach_profiles.rating_avg at the PostgREST level.
- Pre-approved by Lasith (STEP 1 Q3 fallback). Follow-up filed as `PUB-API-01-followup-sort-rpc`.
- `has_more` becomes a lower bound when live coaches > 200 — documented in route comment.

**NULL-last JS sort correctness (all five cases pass):**
- both NULL → fall through to rating_count
- one NULL → other wins
- both non-NULL, different → numeric DESC
- tie on rating → rating_count DESC
- tie on both → created_at DESC via localeCompare on ISO-8601 strings (lexicographic == chronological)

**CORS `*` origin:**
- Appropriate for a fully public, no-auth, no-cookie endpoint. Not a violation.
- `Access-Control-Max-Age: 86400` (24h) is fine.

**`?location` no-op pattern:**
- `void searchParams.get('location')` — accepted forward-compatibility pattern so clients can wire the param early.
- Filed `PUB-API-01-followup-geo`.

**Columns exposed by the public user_profiles policy:**
- SELECT projects only: `full_name`, `avatar_url`, `location_city`.
- `location_lat`, `location_lng`, `location_postcode`, `date_of_birth`, medical fields, `auth_user_id` are NOT projected.
- The policy technically allows anon SELECT on all columns — column-level RLS or a DB view could hard-block `location_lat`/`location_lng`. Filed as nice-to-have in review.
