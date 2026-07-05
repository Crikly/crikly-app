-- Migration 036: coach_time_claims — canonical ledger of committed coach time (BUG-19 Phase 2, P1)
-- Created: 2026-07-05
-- Description: One row per way a coach's time is committed — a live 1-on-1
--   booking (including a pending_payment hold) or a scheduled group programme
--   session (camp-mode sessions produce one claim PER time block via
--   slot_index). Phase 2's DB-level double-sell guarantee is a partial GiST
--   exclusion constraint over ACTIVE claims; that constraint is deliberately
--   NOT added here — migration 037 must first backfill existing commitments
--   and resolve legacy overlaps, then migration 038 adds the constraint (and
--   the triggers that keep this table in sync with its source tables).
--
-- Design decisions (approved by Lasith, BUG-19 Phase 2 Step 0, 5 Jul 2026):
--   - (claim_date, timerange-over-time) instead of tstzrange: every source
--     stores wall-clock UK date + time, no session crosses midnight
--     (end > start CHECKs on bookings and group_programme_sessions), and an
--     Europe/London conversion is not IMMUTABLE (tzdata-dependent) — the
--     custom range type is exact and DST-proof.
--   - source_id has NO foreign key: programme PATCH hard-deletes session rows
--     (reconciliation path, migration 031's upsert design) and a released
--     claim must survive as audit history.
--   - state is two-valued. 'active' = the claim occupies the coach's time and
--     participates in the exclusion constraint. 'released' = history; never
--     blocks (the BUG-13/034 lesson applied at claim level).
--
-- Risk: 🟡 additive — new table only; no existing table, index, or RLS touched.

BEGIN;

-- btree_gist provides GiST operator classes for uuid/date equality so they can
-- join a range column inside one exclusion constraint (added in migration 038).
-- Supabase convention: extensions live in the `extensions` schema.
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

-- Range over `time` — sessions are same-day by construction. The constructor
-- public.timerange(time, time) is created automatically with the type.
CREATE TYPE timerange AS RANGE (subtype = time);

CREATE TABLE coach_time_claims (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_profile_id uuid NOT NULL REFERENCES coach_profiles(id) ON DELETE CASCADE,
    claim_date date NOT NULL,
    start_time time NOT NULL,
    end_time time NOT NULL,
    source_type text NOT NULL,
    source_id uuid NOT NULL,
    -- Camp-mode block ordinal: block N of the source session's slots array.
    -- Non-camp sources always use 0.
    slot_index integer NOT NULL DEFAULT 0,
    state text NOT NULL DEFAULT 'active',
    released_at timestamptz,
    release_reason text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT valid_source_type CHECK (source_type IN ('booking', 'programme_session')),
    CONSTRAINT valid_state CHECK (state IN ('active', 'released')),
    CONSTRAINT valid_time_range CHECK (end_time > start_time),
    CONSTRAINT valid_slot_index CHECK (slot_index >= 0),
    -- released_at set exactly when released; release_reason only on released rows.
    CONSTRAINT release_consistent CHECK (
        ((state = 'active') = (released_at IS NULL))
        AND (release_reason IS NULL OR state = 'released')
    ),
    -- One claim per source block — the triggers' upsert anchor.
    CONSTRAINT uniq_claim_source UNIQUE (source_type, source_id, slot_index)
);

COMMENT ON TABLE coach_time_claims IS
    'Canonical ledger of committed coach time (BUG-19 Phase 2). One row per booking or per programme-session time block. Active rows are mutually non-overlapping per coach via the no_overlapping_active_claims exclusion constraint (migration 038).';
COMMENT ON COLUMN coach_time_claims.slot_index IS
    'Camp-mode block ordinal within the source session''s slots jsonb array; 0 for single-block sessions and bookings.';
COMMENT ON COLUMN coach_time_claims.release_reason IS
    'Why the claim stopped holding time: source lifecycle (e.g. booking cancellation_reason such as expired_pending_payment / payment_intent_cancelled, session_deleted, programme_cancelled), legacy_overlap_backfill (migration 037), or sweep_reconciled (cron drift reconciler).';

-- Coach schedule lookups + the cron reconciler's active-claims scan.
CREATE INDEX coach_time_claims_coach_date_idx
    ON coach_time_claims (coach_profile_id, claim_date)
    WHERE state = 'active';

CREATE TRIGGER update_coach_time_claims_updated_at
    BEFORE UPDATE ON coach_time_claims
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Row Level Security
-- ============================================
-- Coaches may read their own claims (their own schedule detail). No public
-- SELECT: the availability API already exposes busy intervals shape-only;
-- claims additionally carry release reasons and source links that must not
-- leak. NO INSERT/UPDATE/DELETE policies for any role — writes happen only
-- via the SECURITY DEFINER trigger functions (migration 038) and the
-- service-role client, both of which bypass RLS.

ALTER TABLE coach_time_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can view own time claims"
    ON coach_time_claims
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM coach_profiles cp
            JOIN user_profiles up ON cp.user_profile_id = up.id
            WHERE cp.id = coach_time_claims.coach_profile_id
              AND up.auth_user_id = auth.uid()
        )
    );

NOTIFY pgrst, 'reload schema';

COMMIT;
