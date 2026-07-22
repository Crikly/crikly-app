-- BUG-39: add the missing foreign key coach_sports.sport_id → sports(id).
--
-- Why it was missing: coach_sports was created in migration 002 before the
-- sports table existed (migration 003), so sport_id shipped as a bare
-- uuid NOT NULL and no later migration added the constraint.
--
-- Impact of the gap:
--   - PostgREST cannot resolve the nested embed coach_sports → sports
--     (PGRST200 "Could not find a relationship"), which makes
--     GET /api/coaches return 500 on every migrations-built database.
--   - The coach-has-sport check in PATCH /api/coaches/availability/[blockId]
--     (coach_sports select with sports!inner) fails the same way.
--   - No referential integrity: nothing prevents a coach_sports row from
--     pointing at a non-existent sport.
--
-- ON DELETE RESTRICT: sports is an admin-configured list managed via
-- is_active — rows are never hard-deleted. If an in-use sport were ever
-- hard-deleted it must be blocked, not cascaded.
--
-- Precondition: every coach_sports.sport_id must exist in sports(id),
-- otherwise the ALTER fails during validation. Pre-flight check:
--   SELECT count(*) FROM coach_sports cs
--   LEFT JOIN sports s ON s.id = cs.sport_id WHERE s.id IS NULL;
--
-- RLS: no policy changes. Embedding still requires SELECT on sports, which
-- the existing "Public can view sports" policy already grants.

ALTER TABLE coach_sports
  ADD CONSTRAINT coach_sports_sport_id_fkey
  FOREIGN KEY (sport_id) REFERENCES sports(id) ON DELETE RESTRICT;

-- Supporting index for the FK (Postgres does not create one automatically).
-- The existing unique(coach_profile_id, sport_id) index is not usable for
-- sport_id-leading lookups.
CREATE INDEX idx_coach_sports_sport_id ON coach_sports (sport_id);
