-- Migration 028 — PERF-01-FIX
-- Backfill coach_profiles.slug for any coach whose slug is NULL. This
-- migration is a one-off cleanup; the runtime slug backfill that was in
-- the GET /api/coaches/profile handler is removed in the same commit
-- (it caused 1–51 extra round-trips per call and run-3 latency spikes —
-- see PERF-01 investigation, 12 May 2026).
--
-- Slugify logic mirrors src/app/api/coaches/profile/route.ts generateSlug():
--   lowercase → spaces→hyphens → strip non-alphanumeric → collapse
--   hyphens → trim leading/trailing hyphens → fallback 'coach' if empty.
--
-- Uniqueness handled via DO-block loop mirroring findUniqueSlug() in
-- the same TS file: try base, then base-2, base-3, ... up to base-52,
-- then fall back to base-{epoch}. Idempotent — re-running is a no-op
-- since the WHERE clause filters to slug IS NULL.

DO $$
DECLARE
  coach        RECORD;
  base_slug    TEXT;
  candidate    TEXT;
  suffix       INT;
BEGIN
  FOR coach IN
    SELECT cp.id, up.full_name
    FROM coach_profiles cp
    JOIN user_profiles up ON cp.user_profile_id = up.id
    WHERE cp.slug IS NULL
    ORDER BY cp.created_at
  LOOP
    -- Slugify full_name (mirrors generateSlug in TS)
    base_slug := regexp_replace(
                   regexp_replace(
                     regexp_replace(
                       regexp_replace(
                         lower(COALESCE(coach.full_name, '')),
                         '\s+', '-', 'g'
                       ),
                       '[^a-z0-9-]', '', 'g'
                     ),
                     '-+', '-', 'g'
                   ),
                   '^-|-$', '', 'g'
                 );

    -- Empty-string fallback (mirrors AF-H-51 fallback in findUniqueSlug)
    IF base_slug = '' THEN
      base_slug := 'coach';
    END IF;

    -- Find a unique slug — try base, base-2, base-3, ..., base-52
    candidate := base_slug;
    suffix    := 2;

    WHILE EXISTS (SELECT 1 FROM coach_profiles WHERE slug = candidate) LOOP
      IF suffix > 52 THEN
        -- Timestamp fallback (mirrors `${base}-${Date.now()}` in TS)
        candidate := base_slug || '-' || EXTRACT(EPOCH FROM NOW())::bigint::text;
        EXIT;
      END IF;
      candidate := base_slug || '-' || suffix::text;
      suffix    := suffix + 1;
    END LOOP;

    UPDATE coach_profiles
    SET slug = candidate
    WHERE id = coach.id;
  END LOOP;
END $$;
