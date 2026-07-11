-- Migration 033: Guest programme-enrolment payment support (P-00c-ENROL)
-- Created: 2026-06-25
-- Description: Adds the schema the guest programme-enrolment checkout needs. The
--   1-to-1 guest flow (bookings + payment_intents) already exists; group
--   programmes had only coach-managed enrolment columns. This migration brings
--   programme enrolments up to the same paid-checkout lifecycle:
--     M1 — group_programme_enrolments: payment lifecycle + reference + money snapshot
--     M2 — payment_intents: allow an enrolment-linked intent (booking XOR enrolment)
--     M3 — group_programme_enrolment_sessions: per-session record (session-row level)
--     M4 — increment_programme_spots(): atomic capacity-guarded spot increment
--
-- Risk: 🔴 HIGH — M2 modifies an existing column on the money table
--   (payment_intents.booking_id → nullable) and adds a new RLS'd table (M3).
--   Approved by Lasith in P-00c-ENROL STEP 0 (decisions 1-5). Reviewed by
--   supabase-migration-reviewer before commit.
--
-- Safety: All DDL runs inside one transaction. Column adds are additive with
--   IF NOT EXISTS. payment_intents.booking_id only relaxes (NOT NULL dropped) —
--   every existing row already has a booking_id, so the new XOR CHECK validates
--   against current data without rewrites. No rows are mutated.
--
-- Money: every new amount column is integer pence (BR-10). commission_rate is
--   numeric(5,4) to match platform_config.default_commission_rate.

BEGIN;

-- ============================================================================
-- M1 — group_programme_enrolments: paid-checkout lifecycle + money snapshot
-- ============================================================================
-- payment_status gates whether the enrolment holds a spot. status (the existing
-- 'active'/'cancelled'/'completed' column) is left untouched — a guest enrolment
-- is created status='active', payment_status='pending', and only counts toward
-- current_spots once the webhook flips payment_status='succeeded'.

ALTER TABLE group_programme_enrolments
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending', 'succeeded', 'failed', 'refunded')),
  ADD COLUMN IF NOT EXISTS enrolment_reference text,
  ADD COLUMN IF NOT EXISTS coach_amount_pence integer
    CHECK (coach_amount_pence IS NULL OR coach_amount_pence >= 0),
  ADD COLUMN IF NOT EXISTS commission_pence integer
    CHECK (commission_pence IS NULL OR commission_pence >= 0),
  ADD COLUMN IF NOT EXISTS parent_total_pence integer
    CHECK (parent_total_pence IS NULL OR parent_total_pence >= 0),
  ADD COLUMN IF NOT EXISTS commission_rate numeric(5, 4),
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'GBP';

-- enrolment_reference is unique when present (NULLs allowed for legacy/coach rows).
CREATE UNIQUE INDEX IF NOT EXISTS group_programme_enrolments_reference_key
  ON group_programme_enrolments (enrolment_reference)
  WHERE enrolment_reference IS NOT NULL;

-- ============================================================================
-- M2 — payment_intents: allow an intent to belong to a programme enrolment
-- ============================================================================
-- 🔴 Existing-column change: booking_id was NOT NULL. A payment intent now
-- belongs to EITHER a 1-to-1 booking OR a programme enrolment, never both.

ALTER TABLE payment_intents
  ALTER COLUMN booking_id DROP NOT NULL;

ALTER TABLE payment_intents
  ADD COLUMN IF NOT EXISTS enrolment_id uuid
    REFERENCES group_programme_enrolments(id) ON DELETE RESTRICT;

ALTER TABLE payment_intents
  DROP CONSTRAINT IF EXISTS payment_intents_booking_xor_enrolment;

ALTER TABLE payment_intents
  ADD CONSTRAINT payment_intents_booking_xor_enrolment
  CHECK (
    (booking_id IS NOT NULL AND enrolment_id IS NULL) OR
    (booking_id IS NULL AND enrolment_id IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS payment_intents_enrolment_id_idx
  ON payment_intents (enrolment_id);

-- ============================================================================
-- M3 — group_programme_enrolment_sessions: per-session enrolment record
-- ============================================================================
-- One row per session a per_session enrolment paid for. References the session
-- ROW (date-level), not individual camp slots (slot-level deferred — P-00c S0
-- decision 4). price_pence is the per-session price snapshot at enrolment time.

CREATE TABLE IF NOT EXISTS group_programme_enrolment_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrolment_id uuid NOT NULL
    REFERENCES group_programme_enrolments(id) ON DELETE CASCADE,
  group_programme_session_id uuid NOT NULL
    REFERENCES group_programme_sessions(id),
  price_pence integer NOT NULL CHECK (price_pence >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT group_programme_enrolment_sessions_unique
    UNIQUE (enrolment_id, group_programme_session_id)
);

-- Reverse-lookup index (per-session attendance queries); the UNIQUE constraint
-- already covers enrolment_id-led lookups.
CREATE INDEX IF NOT EXISTS gpe_sessions_session_id_idx
  ON group_programme_enrolment_sessions (group_programme_session_id);

ALTER TABLE group_programme_enrolment_sessions ENABLE ROW LEVEL SECURITY;

-- SELECT: the enrolling user (own enrolment) ...
DROP POLICY IF EXISTS "gpe_sessions_select_own" ON group_programme_enrolment_sessions;
CREATE POLICY "gpe_sessions_select_own"
ON group_programme_enrolment_sessions FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM group_programme_enrolments e
    JOIN user_profiles up ON e.booked_by_user_id = up.id
    WHERE e.id = group_programme_enrolment_sessions.enrolment_id
      AND up.auth_user_id = auth.uid()
  )
);

-- ... or the coach who owns the programme.
DROP POLICY IF EXISTS "gpe_sessions_select_coach" ON group_programme_enrolment_sessions;
CREATE POLICY "gpe_sessions_select_coach"
ON group_programme_enrolment_sessions FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM group_programme_enrolments e
    JOIN group_programmes gp ON gp.id = e.programme_id
    JOIN coach_profiles cp ON gp.coach_profile_id = cp.id
    JOIN user_profiles up ON cp.user_profile_id = up.id
    WHERE e.id = group_programme_enrolment_sessions.enrolment_id
      AND up.auth_user_id = auth.uid()
  )
);

-- INSERT / UPDATE / DELETE: service role only. No policies for these commands
-- means only the service-role client (which bypasses RLS) can write — guest
-- enrolment rows are created server-side in /api/guest/programme-enrolments.

-- ============================================================================
-- M4 — atomic, capacity-guarded spot increment
-- ============================================================================
-- Called from the Stripe webhook (payment_intent.succeeded) when a programme
-- enrolment is confirmed. Increments current_spots by 1 only while there is
-- room. Returns true if a spot was taken, false if the programme was already
-- full (caller logs + flags for manual refund — P-00c S0 decision 3).
-- search_path is pinned so the function resolves tables unambiguously.

CREATE OR REPLACE FUNCTION increment_programme_spots(p_programme_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE group_programmes
  SET current_spots = current_spots + 1,
      updated_at = now()
  WHERE id = p_programme_id
    AND current_spots < max_spots;
  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION increment_programme_spots(uuid) TO service_role;

-- PostgREST schema-cache reload so the new column/table/function are visible
-- to the API layer immediately.
NOTIFY pgrst, 'reload schema';

COMMIT;

-- ── Rollback (manual, for reference — never auto-run) ──────────────────────
-- Safe only when no programme-enrolment payment intents exist.
-- BEGIN;
--   DROP FUNCTION IF EXISTS increment_programme_spots(uuid);
--   DROP TABLE IF EXISTS group_programme_enrolment_sessions;
--   ALTER TABLE payment_intents DROP CONSTRAINT IF EXISTS payment_intents_booking_xor_enrolment;
--   DROP INDEX IF EXISTS payment_intents_enrolment_id_idx;
--   ALTER TABLE payment_intents DROP COLUMN IF EXISTS enrolment_id;
--   -- Only re-add NOT NULL once every row has a booking_id again:
--   ALTER TABLE payment_intents ALTER COLUMN booking_id SET NOT NULL;
--   DROP INDEX IF EXISTS group_programme_enrolments_reference_key;
--   ALTER TABLE group_programme_enrolments
--     DROP COLUMN IF EXISTS payment_status,
--     DROP COLUMN IF EXISTS enrolment_reference,
--     DROP COLUMN IF EXISTS coach_amount_pence,
--     DROP COLUMN IF EXISTS commission_pence,
--     DROP COLUMN IF EXISTS parent_total_pence,
--     DROP COLUMN IF EXISTS commission_rate,
--     DROP COLUMN IF EXISTS currency;
--   NOTIFY pgrst, 'reload schema';
-- COMMIT;
