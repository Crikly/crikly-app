-- Migration 040: camp slot granularity (BUG-23, REQ-P-NEW-01)
-- Created: 2026-07-06
-- Description: A camp day has multiple time blocks (group_programme_sessions
--   .slots jsonb), but enrolment was recorded at session-ROW level — the
--   P-00c S0 "decision 4" deferral documented in migration 033. Under the
--   authoritative rulings (Lasith, 5–6 Jul 2026):
--     1. each camp SLOT is one session at the per-session price;
--     2. full day = both slots = 2×;
--     3. max_spots applies PER SLOT;
--     4. BR-01 unchanged (10% on top, coach receives full price).
--   This migration gives the enrolment junction slot identity and adds the
--   capacity machinery:
--     M1 — group_programme_enrolment_sessions.slot_index (+ widened UNIQUE)
--     M2 — backfill notice for ambiguous legacy camp rows (pinned slot 0)
--     M3 — camp_slot_occupancy(): public per-slot taken counts (aggregate only)
--     M4 — reserve_camp_slot_sessions(): atomic pre-charge reservation
--     M5 — confirm_camp_slot_spots(): webhook-time re-check
--
-- Occupancy definition (shared by M3/M4/M5): a (session, slot) spot is held by
-- a junction row whose enrolment is not cancelled AND is either
-- payment_status='succeeded' OR 'pending' created within the last 15 minutes —
-- the BUG-13b SOFT_TTL convention: a live checkout holds its spot, an
-- abandoned one self-expires with no reaper (approved Step 0, 6 Jul 2026).
--
-- Race safety: reserve_camp_slot_sessions locks the involved session rows
-- FOR UPDATE in sorted-id order (deadlock-safe), so two parents racing for
-- the last spot of one slot serialize — the loser sees the winner's
-- fresh-pending hold and gets a clean 409 BEFORE any Stripe intent exists.
-- confirm_camp_slot_spots is the webhook-time backstop (counts succeeded
-- others under the same lock); a false lands in the existing MANUAL REFUND
-- NEEDED path, mirroring increment_programme_spots (033 M4) semantics.
--
-- Risk: 🔴 HIGH — money-adjacent junction (price_pence snapshots) + the
--   capacity mechanism for a public checkout. Approved by Lasith in BUG-23
--   Step 0 (6 Jul 2026, all four flagged items ruled).

BEGIN;

-- ============================================================================
-- M1 — slot_index on the enrolment junction
-- ============================================================================
-- DEFAULT 0 is load-bearing and permanent: non-camp sessions have exactly one
-- block, so their (unchanged) insert path keeps writing slot 0.

ALTER TABLE group_programme_enrolment_sessions
  ADD COLUMN IF NOT EXISTS slot_index integer NOT NULL DEFAULT 0;

ALTER TABLE group_programme_enrolment_sessions
  ADD CONSTRAINT valid_enrolment_slot_index
  CHECK (slot_index >= 0 AND slot_index <= 19);

COMMENT ON COLUMN group_programme_enrolment_sessions.slot_index IS
  'Which time block of the session this row pays for — ordinal into
   group_programme_sessions.slots (0 for single-block/non-camp sessions).
   Mirrors coach_time_claims.slot_index (migration 036). One junction row per
   slot; price_pence is the per-slot snapshot (= per-session price, BUG-23
   ruling 1).';

-- Widen the UPSERT/uniqueness anchor: one row per (enrolment, session, slot).
ALTER TABLE group_programme_enrolment_sessions
  DROP CONSTRAINT group_programme_enrolment_sessions_unique;

ALTER TABLE group_programme_enrolment_sessions
  ADD CONSTRAINT group_programme_enrolment_sessions_unique
  UNIQUE (enrolment_id, group_programme_session_id, slot_index);

-- Capacity queries (M3/M4/M5) all filter by (session, slot); the UNIQUE above
-- leads with enrolment_id and cannot serve them. Composite index keeps the
-- occupancy counts inside the L-02d p95 target as camp volume grows.
CREATE INDEX IF NOT EXISTS gpe_sessions_session_slot_idx
  ON group_programme_enrolment_sessions (group_programme_session_id, slot_index);

-- ============================================================================
-- M2 — backfill notice (approved rule: pin legacy rows to slot 0, loudly)
-- ============================================================================
-- Existing rows keep slot_index 0 via the DEFAULT — no rows are rewritten and
-- no money value changes. For non-camp rows that is exactly correct. For rows
-- on MULTI-BLOCK camp sessions the historical slot identity was never
-- captured (sold as "whole day" at 1× — the BUG-23 defect itself): the parent
-- paid for ONE session, so under ruling 1 they hold ONE slot, deterministically
-- slot 0 (the first block). The NOTICE below is the manual-reconciliation
-- trigger on every environment this replays against (pre-launch everywhere).

DO $$
DECLARE
    v_count integer;
    v_refs text;
BEGIN
    SELECT count(*), string_agg(DISTINCT COALESCE(e.enrolment_reference, e.id::text), ', ')
      INTO v_count, v_refs
      FROM group_programme_enrolment_sessions ges
      JOIN group_programme_sessions s ON s.id = ges.group_programme_session_id
      JOIN group_programme_enrolments e ON e.id = ges.enrolment_id
     WHERE s.slots IS NOT NULL
       AND jsonb_typeof(s.slots) = 'array'
       AND jsonb_array_length(s.slots) > 1;

    IF v_count > 0 THEN
        RAISE NOTICE 'BUG-23 backfill: % legacy junction row(s) on multi-block camp sessions pinned to slot_index 0 (sold as whole-day at 1x before slot granularity). Manual coach reconciliation may be needed. Enrolment refs: %',
            v_count, v_refs;
    ELSE
        RAISE NOTICE 'BUG-23 backfill: no ambiguous camp junction rows found.';
    END IF;
END;
$$;

-- ============================================================================
-- M3 — camp_slot_occupancy(): public per-slot taken counts
-- ============================================================================
-- Aggregate counts ONLY — no enrolment ids, no participant data — so granting
-- to anon is safe: it reveals exactly what the picker must render ("N left" /
-- "Full"), nothing the availability surface doesn't already imply.

CREATE OR REPLACE FUNCTION public.camp_slot_occupancy(p_programme_id uuid)
RETURNS TABLE (session_id uuid, slot_index integer, taken integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT ges.group_programme_session_id AS session_id,
           ges.slot_index,
           count(*)::integer AS taken
      FROM public.group_programme_enrolment_sessions ges
      JOIN public.group_programme_enrolments e ON e.id = ges.enrolment_id
      JOIN public.group_programme_sessions s ON s.id = ges.group_programme_session_id
     WHERE s.group_programme_id = p_programme_id
       AND e.status <> 'cancelled'
       AND (e.payment_status = 'succeeded'
            OR (e.payment_status = 'pending'
                AND e.created_at > now() - interval '15 minutes'))
     GROUP BY ges.group_programme_session_id, ges.slot_index;
$$;

-- ============================================================================
-- M4 — reserve_camp_slot_sessions(): atomic pre-charge reservation
-- ============================================================================
-- Called by POST /api/guest/programme-enrolments (service role) for CAMP
-- programmes, after the enrolment row is created (payment_status='pending')
-- and BEFORE the Stripe PaymentIntent. Inserts this enrolment's junction rows
-- iff every requested (session, slot) still has a spot; otherwise inserts
-- nothing and returns the full pairs so the route can 409 cleanly.
--
-- p_selections: jsonb array of {"sessionId": uuid, "slotIndex": int}. The
-- route has already validated membership/blockCount; this function still
-- verifies BOTH independently (defence in depth): each session must belong to
-- the enrolment's programme AND each slotIndex must be within that session's
-- real block count (slots jsonb length, else 1). A selection failing either
-- inserts nothing and the count check raises, aborting the transaction.
--
-- NOT idempotent by design: the API creates a fresh enrolment per attempt and
-- calls this exactly once for it, so a duplicate call for the same enrolment
-- is a bug — the unique constraint raising loudly is the correct behaviour
-- (documented per migration review, 6 Jul 2026).

CREATE OR REPLACE FUNCTION public.reserve_camp_slot_sessions(
    p_enrolment_id uuid,
    p_price_pence integer,
    p_selections jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_programme uuid;
    v_max integer;
    v_full jsonb := '[]'::jsonb;
    v_pair RECORD;
    v_taken integer;
    v_requested integer;
    v_inserted integer;
BEGIN
    SELECT e.programme_id, p.max_spots
      INTO v_programme, v_max
      FROM public.group_programme_enrolments e
      JOIN public.group_programmes p ON p.id = e.programme_id
     WHERE e.id = p_enrolment_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'reserve_camp_slot_sessions: enrolment % not found', p_enrolment_id;
    END IF;

    -- Serialization point: lock the involved session rows in sorted-id order
    -- (consistent ordering prevents AB/BA deadlocks between concurrent
    -- multi-session reservations).
    PERFORM 1
       FROM public.group_programme_sessions s
      WHERE s.group_programme_id = v_programme
        AND s.id IN (SELECT DISTINCT (sel ->> 'sessionId')::uuid
                       FROM jsonb_array_elements(p_selections) sel)
      ORDER BY s.id
        FOR UPDATE;

    -- Per requested pair: count spots held by OTHER enrolments (succeeded, or
    -- fresh-pending holds — see header) under the lock.
    FOR v_pair IN
        SELECT DISTINCT (sel ->> 'sessionId')::uuid AS sid,
                        (sel ->> 'slotIndex')::integer AS idx
          FROM jsonb_array_elements(p_selections) sel
    LOOP
        SELECT count(*)
          INTO v_taken
          FROM public.group_programme_enrolment_sessions ges
          JOIN public.group_programme_enrolments e ON e.id = ges.enrolment_id
         WHERE ges.group_programme_session_id = v_pair.sid
           AND ges.slot_index = v_pair.idx
           AND ges.enrolment_id <> p_enrolment_id
           AND e.status <> 'cancelled'
           AND (e.payment_status = 'succeeded'
                OR (e.payment_status = 'pending'
                    AND e.created_at > now() - interval '15 minutes'));

        IF v_taken >= v_max THEN
            v_full := v_full || jsonb_build_object('sessionId', v_pair.sid, 'slotIndex', v_pair.idx);
        END IF;
    END LOOP;

    IF jsonb_array_length(v_full) > 0 THEN
        RETURN jsonb_build_object('ok', false, 'full', v_full);
    END IF;

    SELECT count(DISTINCT ((sel ->> 'sessionId') || '#' || (sel ->> 'slotIndex')))
      INTO v_requested
      FROM jsonb_array_elements(p_selections) sel;

    INSERT INTO public.group_programme_enrolment_sessions
        (enrolment_id, group_programme_session_id, slot_index, price_pence)
    SELECT DISTINCT p_enrolment_id,
           s.id,
           (sel ->> 'slotIndex')::integer,
           p_price_pence
      FROM jsonb_array_elements(p_selections) sel
      JOIN public.group_programme_sessions s
        ON s.id = (sel ->> 'sessionId')::uuid
       AND s.group_programme_id = v_programme
     WHERE (sel ->> 'slotIndex')::integer <
           CASE WHEN s.slots IS NOT NULL
                 AND jsonb_typeof(s.slots) = 'array'
                 AND jsonb_array_length(s.slots) > 0
                THEN jsonb_array_length(s.slots)
                ELSE 1
           END;

    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    IF v_inserted <> v_requested THEN
        -- A selection pointed outside the programme or beyond the session's
        -- real block count — the route validates both, so reaching here means
        -- tampering or a bug: abort the transaction so nothing partial
        -- persists.
        RAISE EXCEPTION 'reserve_camp_slot_sessions: % of % selections invalid for programme %',
            v_requested - v_inserted, v_requested, v_programme;
    END IF;

    RETURN jsonb_build_object('ok', true);
END;
$$;

-- ============================================================================
-- M5 — confirm_camp_slot_spots(): webhook-time re-check
-- ============================================================================
-- Called by the Stripe webhook AFTER the enrolment flips to 'succeeded'
-- (camps only — non-camp keeps increment_programme_spots). Counts OTHER
-- succeeded enrolments per pair under the same session-row lock. false =
-- capacity was overrun in the pre-check→payment window (only possible past
-- the 15-minute hold TTL) → caller logs MANUAL REFUND NEEDED, exactly the
-- increment_programme_spots(false) semantics.

CREATE OR REPLACE FUNCTION public.confirm_camp_slot_spots(p_enrolment_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_max integer;
BEGIN
    SELECT p.max_spots
      INTO v_max
      FROM public.group_programme_enrolments e
      JOIN public.group_programmes p ON p.id = e.programme_id
     WHERE e.id = p_enrolment_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'confirm_camp_slot_spots: enrolment % not found', p_enrolment_id;
    END IF;

    PERFORM 1
       FROM public.group_programme_sessions s
      WHERE s.id IN (SELECT DISTINCT group_programme_session_id
                       FROM public.group_programme_enrolment_sessions
                      WHERE enrolment_id = p_enrolment_id)
      ORDER BY s.id
        FOR UPDATE;

    RETURN NOT EXISTS (
        SELECT 1
          FROM public.group_programme_enrolment_sessions mine
          JOIN public.group_programme_enrolment_sessions other
            ON other.group_programme_session_id = mine.group_programme_session_id
           AND other.slot_index = mine.slot_index
           AND other.enrolment_id <> mine.enrolment_id
          JOIN public.group_programme_enrolments oe ON oe.id = other.enrolment_id
         WHERE mine.enrolment_id = p_enrolment_id
           AND oe.status <> 'cancelled'
           AND oe.payment_status = 'succeeded'
         GROUP BY mine.group_programme_session_id, mine.slot_index
        HAVING count(*) >= v_max
    );
END;
$$;

-- ============================================================================
-- Execution privileges
-- ============================================================================
-- Occupancy is public (aggregate counts feed the guest picker). The two
-- mutation/verify functions are service-role only (the API route and the
-- Stripe webhook both use the admin client). Explicit grants per the
-- migration-033/038 precedent — never rely on default privileges alone.

REVOKE EXECUTE ON FUNCTION public.camp_slot_occupancy(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.camp_slot_occupancy(uuid) TO anon, authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.reserve_camp_slot_sessions(uuid, integer, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_camp_slot_sessions(uuid, integer, jsonb) TO service_role;

REVOKE EXECUTE ON FUNCTION public.confirm_camp_slot_spots(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_camp_slot_spots(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
