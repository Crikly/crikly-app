-- Migration 048: Add optional gender to child_profiles and player_profiles
-- Created: 2026-07-27
-- Task: P-01 (Block 1 parent schema foundations) — GAP-P-03 (REQ-P-012, REQ-P-021)
-- Description: Optional gender on child and player profiles. Used for default
--   avatar selection and shown to a confirmed coach as session context —
--   never shown publicly (REQ-P-012). player_profiles gets the same column
--   for parity (REQ-P-021: player self-profile mirrors the child profile).
--
-- Values mirror the coach gender enum exactly (Lasith decision, Step 0):
--   male / female / other / prefer_not_to_say — the same set the coach
--   profile API validates (src/app/api/coaches/profile/route.ts). Stored as
--   text + CHECK (not a Postgres enum type) for consistency with
--   coach_profiles.gender and cheap future extension.
--
-- RLS: no policy changes — existing child_profiles / player_profiles
--   policies (migration 002) cover the new column. Public exposure is
--   impossible because neither table has a public SELECT policy.
--
-- Risk: 🟢 Low in isolation (additive nullable columns, both tables empty in
--   every environment — verified Step 0). Part of P-01 which is 🔴 overall.
--
-- Down migration:
--   ALTER TABLE child_profiles DROP COLUMN gender;
--   ALTER TABLE player_profiles DROP COLUMN gender;

ALTER TABLE child_profiles
    ADD COLUMN gender text
    CONSTRAINT child_profiles_gender_check
    CHECK (gender IN ('male', 'female', 'other', 'prefer_not_to_say'));

ALTER TABLE player_profiles
    ADD COLUMN gender text
    CONSTRAINT player_profiles_gender_check
    CHECK (gender IN ('male', 'female', 'other', 'prefer_not_to_say'));
