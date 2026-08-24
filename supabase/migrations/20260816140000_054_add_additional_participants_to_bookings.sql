-- 054: additional group-booking participants on bookings (P-10 schema gap).
--
-- bookings previously stored exactly ONE participant (participant_name /
-- participant_age), so every additional player in a group booking was lost
-- before reaching the database or the coach. This column stores players
-- 2..N; the PRIMARY player stays in participant_name / participant_age —
-- backwards compatibility, every existing consumer keeps working unchanged.
--
-- Entry shape (one object per additional player):
--   [{ "name": text, "age": int|null, "child_profile_id": uuid|null }]
--   - child_profile_id links a parent's child profile for authed bookings and
--     is null for guest players. Deliberately NO foreign key (same reasoning
--     as coach_time_claims.source_id, migration 036): entries are
--     point-in-time booking records and must survive a child profile's
--     removal. Child session-history queries match on it via jsonb
--     containment (approved decision 3, wired in later phases).
--   - Max entries = (highest group_price_tiers key) - 1 (approved decision
--     5; the primary player counts toward the total). That is a cross-table
--     rule, so — exactly like migration 053 for group_price_tiers (the
--     AF-H-56 lesson) — the DB guards only the coarse type and every deeper
--     rule lives in the shared app-side participants validator used by both
--     booking routes.
--
-- Additive only: NULL for every existing row, no backfill, no data changes.
-- RLS: bookings' existing row-level policies cover the new column; no policy
-- changes. NULL = a 1-on-1 booking (the overwhelming existing case).

ALTER TABLE bookings
  ADD COLUMN additional_participants jsonb NULL;

ALTER TABLE bookings
  ADD CONSTRAINT bookings_additional_participants_is_array
  CHECK (
    additional_participants IS NULL
    OR jsonb_typeof(additional_participants) = 'array'
  );

COMMENT ON COLUMN bookings.additional_participants IS
  'Group-booking players 2..N: [{name text, age int|null, child_profile_id uuid|null}]. Primary player stays in participant_name/participant_age. NULL for 1-on-1 bookings. Entry rules enforced app-side (migration-053/AF-H-56 pattern).';
