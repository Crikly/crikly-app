-- ============================================================================
-- Migration 031 — CF-PROG-SESSIONS-DB
--
-- Persists the per-session list (group_programme_sessions rows) and the
-- camp-mode flag (group_programmes.camp_mode) that the API has been
-- collecting on the request body but silently dropping since the
-- CF-PROG-SESSION-LIST work shipped.
--
-- Decisions captured in the build plan:
--   1. Slot storage: jsonb column on group_programme_sessions (option B).
--      slots IS NULL → single time block, use the row's start_time/end_time.
--      slots IS array → camp-mode multi-slot day. By convention slots[0]
--      mirrors the row's start_time/end_time so downstream consumers that
--      read only those columns still see the first block.
--   2. UNIQUE (group_programme_id, session_date) — enables safe UPSERT.
--   3. camp_mode lives on group_programmes (one toggle per programme,
--      matches the single switch on the create/edit form).
--   6. No backfill — existing programmes' next save by the coach will
--      repopulate session rows via the new POST/PATCH code paths.
--
-- This migration is additive only: no column drops, no data deletion, no
-- RLS changes (existing group_programme_sessions policies cover the new
-- slots column unchanged).
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. group_programmes.camp_mode
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE group_programmes
  ADD COLUMN IF NOT EXISTS camp_mode boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN group_programmes.camp_mode IS
  'When true, each session row may carry a slots jsonb array (multiple time blocks per day). When false, slots is always NULL.';

-- ────────────────────────────────────────────────────────────────────────────
-- 2. group_programme_sessions.slots
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE group_programme_sessions
  ADD COLUMN IF NOT EXISTS slots jsonb NULL;

COMMENT ON COLUMN group_programme_sessions.slots IS
  'Camp-mode time blocks: jsonb array of {"startTime":"HH:MM","endTime":"HH:MM"}. NULL means single block — use the row''s own start_time/end_time. When non-null, slots[0] mirrors the row''s start_time/end_time so downstream consumers reading only those columns still see the first block.';

-- Structural guard: slots must be NULL or a JSON array (no objects, no scalars).
-- Per-element shape is enforced server-side in the POST/PATCH validators.
ALTER TABLE group_programme_sessions
  ADD CONSTRAINT chk_session_slots_array
  CHECK (slots IS NULL OR jsonb_typeof(slots) = 'array');

-- ────────────────────────────────────────────────────────────────────────────
-- 3. UNIQUE (group_programme_id, session_date)
--
-- Enables `INSERT … ON CONFLICT (group_programme_id, session_date) DO UPDATE`
-- in the API's PATCH reconciliation path. Also serves as the BTREE index for
-- queries filtered by group_programme_id alone, so no separate index needed.
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE group_programme_sessions
  ADD CONSTRAINT uniq_programme_session_date
  UNIQUE (group_programme_id, session_date);
