-- Migration 038: exclusion constraint + claim-sync triggers (BUG-19 Phase 2, P3)
-- Created: 2026-07-05
-- Description: The DB-level double-sell guarantee. Adds the PARTIAL GiST
--   exclusion constraint over ACTIVE claims (two overlapping active claims for
--   one coach cannot coexist; released claims never block), plus the triggers
--   that keep coach_time_claims transactionally in sync with its sources:
--
--     bookings                → sync_booking_claim()
--     group_programme_sessions → sync_programme_session_claims()
--     group_programmes         → sync_programme_claims() (status/soft-delete cascade)
--
--   Triggers — not app writes — because the source tables are mutated from 6+
--   code paths (guest route, 3 webhook handlers, reaper, coach status routes,
--   programme CRUD) plus Studio; a trigger makes the source write and its
--   claim change ONE transaction, so double-release and leaked holds are
--   impossible by construction. The BUG-13b release path (UPDATE bookings SET
--   deleted_at = …) is REUSED verbatim: this trigger translates that exact
--   write into the claim release — no webhook/reaper code changes.
--
--   An overlapping write now fails with SQLSTATE 23P01 (exclusion_violation)
--   raised from inside the trigger and rolls back the source write. App glue
--   maps 23P01 → 409 in the guest route and programme POST/PATCH (P4).
--
--   reconcile_coach_time_claims() is the drift reconciler the BUG-13b cron
--   route (/api/cron/release-expired-bookings) calls each run — it releases
--   any active claim whose source no longer holds. With triggers as the only
--   writer it should always return 0; a non-zero result is logged loudly.
--
--   All functions are SECURITY DEFINER with a pinned empty search_path and
--   fully-qualified references (Lasith clarification 5). SECURITY DEFINER is
--   required so RLS-scoped writers (coach flows, future parent flows) still
--   maintain claims — coach_time_claims itself has no write policies.
--
-- Ordering note: the constraint is added FIRST — if migration 037 left any
--   overlap among active claims, this migration fails loudly. That failure is
--   the proof-of-consistency gate, not a bug.
--
-- Risk: 🔴 HIGH — triggers on the money table; new rejection surface on
--   booking/programme writes. Approved by Lasith in Step 0.

BEGIN;

-- ============================================
-- 1. The exclusion constraint
-- ============================================
-- btree_gist (migration 036) supplies GiST equality for uuid and date.
-- Partial (WHERE state = 'active'): released/expired/cancelled claims are
-- audit history and must never block a re-claim of the freed slot.

ALTER TABLE coach_time_claims
    ADD CONSTRAINT no_overlapping_active_claims
    EXCLUDE USING gist (
        coach_profile_id WITH =,
        claim_date WITH =,
        timerange(start_time, end_time) WITH &&
    ) WHERE (state = 'active');

-- ============================================
-- 2. bookings → claims
-- ============================================
-- Holding predicate mirrors the migration-034 partial unique index exactly:
-- deleted_at IS NULL AND status IN ('pending_payment','confirmed','completed').
-- New claims are only CREATED for session_date >= CURRENT_DATE so that
-- lifecycle transitions on legacy past-dated rows (e.g. marking an old
-- booking completed) can never resurrect a pre-Phase-2 historical overlap.
-- Reactivation of an EXISTING claim (webhook restore-after-release path) has
-- no date guard — the exclusion constraint itself arbitrates "still free",
-- and a 23P01 there lands in the webhook's MANUAL REFUND NEEDED branch.

CREATE OR REPLACE FUNCTION public.sync_booking_claim()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NEW.deleted_at IS NULL
       AND NEW.status IN ('pending_payment', 'confirmed', 'completed') THEN
        -- Converge an existing claim (reactivate and/or follow date/time).
        UPDATE public.coach_time_claims
           SET state = 'active',
               released_at = NULL,
               release_reason = NULL,
               claim_date = NEW.session_date,
               start_time = NEW.session_start_time,
               end_time = NEW.session_end_time
         WHERE source_type = 'booking'
           AND source_id = NEW.id
           AND slot_index = 0
           AND (state <> 'active'
                OR claim_date <> NEW.session_date
                OR start_time <> NEW.session_start_time
                OR end_time <> NEW.session_end_time);

        -- No claim yet → create one (future-dated sources only). If a
        -- matching active claim already exists the unique arbiter no-ops.
        INSERT INTO public.coach_time_claims
            (coach_profile_id, claim_date, start_time, end_time,
             source_type, source_id, slot_index)
        SELECT NEW.coach_profile_id, NEW.session_date, NEW.session_start_time,
               NEW.session_end_time, 'booking', NEW.id, 0
        WHERE NEW.session_date >= CURRENT_DATE
        ON CONFLICT (source_type, source_id, slot_index) DO NOTHING;
    ELSE
        UPDATE public.coach_time_claims
           SET state = 'released',
               released_at = now(),
               release_reason = COALESCE(
                   NEW.cancellation_reason,
                   CASE
                       WHEN NEW.deleted_at IS NOT NULL THEN 'booking_soft_deleted'
                       ELSE 'booking_' || NEW.status
                   END)
         WHERE source_type = 'booking'
           AND source_id = NEW.id
           AND state = 'active';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER sync_booking_claim_on_insert
    AFTER INSERT ON bookings
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_booking_claim();

CREATE TRIGGER sync_booking_claim_on_update
    AFTER UPDATE ON bookings
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status
          OR OLD.deleted_at IS DISTINCT FROM NEW.deleted_at
          OR OLD.session_date IS DISTINCT FROM NEW.session_date
          OR OLD.session_start_time IS DISTINCT FROM NEW.session_start_time
          OR OLD.session_end_time IS DISTINCT FROM NEW.session_end_time)
    EXECUTE FUNCTION public.sync_booking_claim();

-- ============================================
-- 3. group_programme_sessions → claims
-- ============================================
-- Shared reconciler: recomputes ALL claims for one session from current DB
-- state. Holding predicate mirrors commitments.ts exactly: session
-- 'scheduled' AND programme IN ('draft','active','full') AND programme not
-- soft-deleted. Camp-mode slots expand to one claim per block (slot_index);
-- blocks removed by an edit are released as 'slot_removed'.

CREATE OR REPLACE FUNCTION public.reconcile_session_claims(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    s public.group_programme_sessions%ROWTYPE;
    v_prog_status text;
    v_prog_deleted timestamptz;
    v_coach uuid;
    v_blocks integer;
BEGIN
    SELECT * INTO s FROM public.group_programme_sessions WHERE id = p_session_id;
    IF NOT FOUND THEN
        -- Hard-deleted (programme PATCH reconciliation) — release, keep audit.
        UPDATE public.coach_time_claims
           SET state = 'released', released_at = now(), release_reason = 'session_deleted'
         WHERE source_type = 'programme_session' AND source_id = p_session_id AND state = 'active';
        RETURN;
    END IF;

    SELECT p.status, p.deleted_at, p.coach_profile_id
      INTO v_prog_status, v_prog_deleted, v_coach
      FROM public.group_programmes p
     WHERE p.id = s.group_programme_id;

    IF NOT FOUND
       OR s.status <> 'scheduled'
       OR v_prog_status NOT IN ('draft', 'active', 'full')
       OR v_prog_deleted IS NOT NULL THEN
        UPDATE public.coach_time_claims
           SET state = 'released',
               released_at = now(),
               release_reason = CASE
                   WHEN s.status <> 'scheduled' THEN 'session_' || s.status
                   WHEN v_prog_deleted IS NOT NULL THEN 'programme_deleted'
                   ELSE 'programme_' || COALESCE(v_prog_status, 'missing')
               END
         WHERE source_type = 'programme_session' AND source_id = s.id AND state = 'active';
        RETURN;
    END IF;

    -- Upsert one claim per block. The ON CONFLICT update fires the exclusion
    -- check when it (re)activates — a conflicting edit fails here with 23P01.
    WITH blocks AS (
        SELECT COALESCE((blk.value ->> 'startTime')::time, s.start_time) AS bstart,
               COALESCE((blk.value ->> 'endTime')::time, s.end_time) AS bend,
               COALESCE(blk.ord - 1, 0)::integer AS idx
        FROM (SELECT 1) one
        LEFT JOIN LATERAL pg_catalog.jsonb_array_elements(s.slots)
            WITH ORDINALITY AS blk(value, ord)
            ON s.slots IS NOT NULL
           AND pg_catalog.jsonb_typeof(s.slots) = 'array'
           AND pg_catalog.jsonb_array_length(s.slots) > 0
    )
    INSERT INTO public.coach_time_claims
        (coach_profile_id, claim_date, start_time, end_time,
         source_type, source_id, slot_index)
    SELECT v_coach, s.session_date, bstart, bend, 'programme_session', s.id, idx
      FROM blocks
    ON CONFLICT (source_type, source_id, slot_index) DO UPDATE
       SET state = 'active',
           released_at = NULL,
           release_reason = NULL,
           claim_date = EXCLUDED.claim_date,
           start_time = EXCLUDED.start_time,
           end_time = EXCLUDED.end_time
     WHERE coach_time_claims.state <> 'active'
        OR coach_time_claims.claim_date <> EXCLUDED.claim_date
        OR coach_time_claims.start_time <> EXCLUDED.start_time
        OR coach_time_claims.end_time <> EXCLUDED.end_time;

    -- Blocks that no longer exist (camp edit shrank the slots array).
    SELECT CASE
               WHEN s.slots IS NOT NULL
                    AND pg_catalog.jsonb_typeof(s.slots) = 'array'
                    AND pg_catalog.jsonb_array_length(s.slots) > 0
               THEN pg_catalog.jsonb_array_length(s.slots)
               ELSE 1
           END
      INTO v_blocks;

    UPDATE public.coach_time_claims
       SET state = 'released', released_at = now(), release_reason = 'slot_removed'
     WHERE source_type = 'programme_session'
       AND source_id = s.id
       AND state = 'active'
       AND slot_index >= v_blocks;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_programme_session_claims()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        UPDATE public.coach_time_claims
           SET state = 'released', released_at = now(), release_reason = 'session_deleted'
         WHERE source_type = 'programme_session' AND source_id = OLD.id AND state = 'active';
        RETURN OLD;
    END IF;

    PERFORM public.reconcile_session_claims(NEW.id);
    RETURN NEW;
END;
$$;

CREATE TRIGGER sync_programme_session_claims_trigger
    AFTER INSERT OR UPDATE OR DELETE ON group_programme_sessions
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_programme_session_claims();

-- ============================================
-- 4. group_programmes status/soft-delete cascade
-- ============================================
-- Cancelling/completing/soft-deleting a programme releases all its session
-- claims; restoring it reactivates them (subject to the constraint — a
-- restore into now-taken time fails, surfacing the conflict to the coach).

CREATE OR REPLACE FUNCTION public.sync_programme_claims()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT id FROM public.group_programme_sessions
        WHERE group_programme_id = NEW.id
    LOOP
        PERFORM public.reconcile_session_claims(r.id);
    END LOOP;
    RETURN NEW;
END;
$$;

CREATE TRIGGER sync_programme_claims_trigger
    AFTER UPDATE ON group_programmes
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status
          OR OLD.deleted_at IS DISTINCT FROM NEW.deleted_at)
    EXECUTE FUNCTION public.sync_programme_claims();

-- ============================================
-- 5. Cron drift reconciler (BUG-13b route, same cadence)
-- ============================================
-- Releases active claims whose source row no longer holds its slot. Belt and
-- braces: triggers are the only writer, so a non-zero return means drift
-- (e.g. a manual Studio edit that dodged a trigger) and the cron route logs
-- it loudly. Release-only by design — it never creates or reactivates.

CREATE OR REPLACE FUNCTION public.reconcile_coach_time_claims()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_bookings integer;
    v_sessions integer;
BEGIN
    UPDATE public.coach_time_claims c
       SET state = 'released', released_at = now(), release_reason = 'sweep_reconciled'
     WHERE c.state = 'active'
       AND c.source_type = 'booking'
       AND NOT EXISTS (
           SELECT 1 FROM public.bookings b
           WHERE b.id = c.source_id
             AND b.deleted_at IS NULL
             AND b.status IN ('pending_payment', 'confirmed', 'completed'));
    GET DIAGNOSTICS v_bookings = ROW_COUNT;

    UPDATE public.coach_time_claims c
       SET state = 'released', released_at = now(), release_reason = 'sweep_reconciled'
     WHERE c.state = 'active'
       AND c.source_type = 'programme_session'
       AND NOT EXISTS (
           SELECT 1
           FROM public.group_programme_sessions s
           JOIN public.group_programmes p ON p.id = s.group_programme_id
           WHERE s.id = c.source_id
             AND s.status = 'scheduled'
             AND p.status IN ('draft', 'active', 'full')
             AND p.deleted_at IS NULL);
    GET DIAGNOSTICS v_sessions = ROW_COUNT;

    RETURN v_bookings + v_sessions;
END;
$$;

-- ============================================
-- 6. Execution privileges
-- ============================================
-- Callable functions are locked to the service role (the cron route uses the
-- admin client). Trigger functions cannot be invoked via RPC (they return
-- trigger) but are revoked anyway for hygiene.

REVOKE EXECUTE ON FUNCTION public.reconcile_coach_time_claims() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reconcile_session_claims(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_booking_claim() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_programme_session_claims() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_programme_claims() FROM PUBLIC, anon, authenticated;

-- Explicit grant for the cron route's admin client (migration-033 precedent —
-- do not rely on Supabase's default-privileges bootstrap alone).
GRANT EXECUTE ON FUNCTION public.reconcile_coach_time_claims() TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
