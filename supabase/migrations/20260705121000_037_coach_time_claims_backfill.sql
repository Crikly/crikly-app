-- Migration 037: coach_time_claims backfill + legacy-overlap sweep (BUG-19 Phase 2, P2)
-- Created: 2026-07-05
-- Description: Represents every EXISTING commitment of a coach's time as a
--   coach_time_claims row so the exclusion constraint (migration 038) holds on
--   real data. Sources:
--     - live bookings: deleted_at IS NULL AND status IN
--       ('pending_payment','confirmed','completed') — exactly the migration-034
--       slot-holding predicate (pending_payment holds included);
--     - scheduled sessions of live programmes: session status 'scheduled',
--       programme status IN ('draft','active','full'), programme not
--       soft-deleted — exactly the commitments.ts predicate. Camp-mode slots
--       jsonb is expanded to one claim per block (Option B, approved).
--
--   PAST-DATED rows (claim_date < the date this migration runs) are skipped
--   entirely: nothing before today can be double-sold (the booking window
--   forbids past slots), and pre-Phase-1 data contains historical overlaps
--   that must not poison the constraint.
--
--   Legacy FUTURE overlaps are resolved by the precedence rule approved in
--   Step 0 (5 Jul 2026) — winner keeps the active claim, loser rows are
--   INSERTED AS state='released' with release_reason='legacy_overlap_backfill'
--   (no source rows are modified — zero data loss; every resolution is
--   queryable). Precedence (lower rank wins):
--     1. confirmed/completed booking (money taken)
--     2. pending_payment hold (money in flight)
--     3. active/full programme with ≥1 non-cancelled enrolment
--     4. active/full programme without enrolments
--     5. draft programme
--   Ties: earlier source created_at, then source id (deterministic).
--
--   HARD GUARD (Lasith clarification 1): if resolution would release a claim
--   belonging to ANY booking or to a programme with ≥1 non-cancelled
--   enrolment, the migration RAISES and HALTS — real customers are never
--   auto-resolved; that situation forces manual review before this can apply
--   (relevant on staging/production replays; local data has no such case).
--
--   Programmes with NO persisted session rows (recurring fallback) get no
--   claims — they stay guarded app-level by commitments.ts, unchanged.
--
-- Risk: 🔴 HIGH — writes derived from bookings (money table). Reviewed by
--   supabase-migration-reviewer; approach approved by Lasith in Step 0.

BEGIN;

DO $$
DECLARE
    v_bad text;
    v_total integer;
    v_active integer;
    v_released integer;
    v_bookings integer;
    v_sessions integer;
    c RECORD;
    v_conflicts boolean;
BEGIN
    -- ── 1. Candidate claims: every future-dated commitment ──────────────────
    CREATE TEMP TABLE _claim_candidates (
        coach_profile_id uuid NOT NULL,
        claim_date date NOT NULL,
        start_time time NOT NULL,
        end_time time NOT NULL,
        source_type text NOT NULL,
        source_id uuid NOT NULL,
        slot_index integer NOT NULL,
        rank integer NOT NULL,
        tiebreak timestamptz NOT NULL,
        enrolled boolean NOT NULL,
        keep boolean,
        PRIMARY KEY (source_type, source_id, slot_index)
    ) ON COMMIT DROP;

    INSERT INTO _claim_candidates
        (coach_profile_id, claim_date, start_time, end_time,
         source_type, source_id, slot_index, rank, tiebreak, enrolled)
    SELECT b.coach_profile_id, b.session_date, b.session_start_time, b.session_end_time,
           'booking', b.id, 0,
           CASE WHEN b.status IN ('confirmed', 'completed') THEN 1 ELSE 2 END,
           b.created_at, false
    FROM bookings b
    WHERE b.deleted_at IS NULL
      AND b.status IN ('pending_payment', 'confirmed', 'completed')
      AND b.session_date >= current_date;

    -- Camp-mode expansion: one candidate per slots[] block; slots[0] mirrors
    -- the row's start/end by the migration-031 convention. NULL/empty slots →
    -- a single block from the row's own times (slot_index 0).
    INSERT INTO _claim_candidates
        (coach_profile_id, claim_date, start_time, end_time,
         source_type, source_id, slot_index, rank, tiebreak, enrolled)
    SELECT p.coach_profile_id, s.session_date,
           COALESCE((blk.value ->> 'startTime')::time, s.start_time),
           COALESCE((blk.value ->> 'endTime')::time, s.end_time),
           'programme_session', s.id, COALESCE(blk.ord - 1, 0)::integer,
           CASE
               WHEN p.status IN ('active', 'full') AND enr.cnt > 0 THEN 3
               WHEN p.status IN ('active', 'full') THEN 4
               ELSE 5
           END,
           p.created_at, enr.cnt > 0
    FROM group_programme_sessions s
    JOIN group_programmes p ON p.id = s.group_programme_id
    LEFT JOIN LATERAL (
        SELECT count(*) AS cnt
        FROM group_programme_enrolments e
        WHERE e.programme_id = p.id AND e.status <> 'cancelled'
    ) enr ON true
    LEFT JOIN LATERAL jsonb_array_elements(s.slots)
        WITH ORDINALITY AS blk(value, ord)
        ON s.slots IS NOT NULL
       AND jsonb_typeof(s.slots) = 'array'
       AND jsonb_array_length(s.slots) > 0
    WHERE s.status = 'scheduled'
      AND p.status IN ('draft', 'active', 'full')
      AND p.deleted_at IS NULL
      AND s.session_date >= current_date;

    -- ── 2. Greedy winner selection in precedence order ──────────────────────
    -- A candidate survives iff it overlaps no already-kept candidate for the
    -- same coach + date (half-open overlap: adjacency is not a conflict).
    -- Iterative, so transitive chains resolve correctly: if A beats B, then C
    -- (overlapping B but not A) still survives.
    FOR c IN
        SELECT source_type, source_id, slot_index
        FROM _claim_candidates
        ORDER BY rank, tiebreak, source_id, slot_index
    LOOP
        SELECT EXISTS (
            SELECT 1
            FROM _claim_candidates w
            JOIN _claim_candidates me
              ON me.source_type = c.source_type
             AND me.source_id = c.source_id
             AND me.slot_index = c.slot_index
            WHERE w.keep
              AND w.coach_profile_id = me.coach_profile_id
              AND w.claim_date = me.claim_date
              AND w.start_time < me.end_time
              AND me.start_time < w.end_time
        ) INTO v_conflicts;

        UPDATE _claim_candidates
           SET keep = NOT v_conflicts
         WHERE source_type = c.source_type
           AND source_id = c.source_id
           AND slot_index = c.slot_index;
    END LOOP;

    -- ── 3. Hard guard: only draft / zero-enrolment programme sessions may
    --       auto-lose. Any other loser halts the migration for manual review.
    SELECT string_agg(
               source_type || ':' || source_id || ' (' || claim_date || ' '
               || start_time || '-' || end_time || ')', ', ')
      INTO v_bad
      FROM _claim_candidates
     WHERE NOT keep
       AND (source_type = 'booking' OR enrolled);

    IF v_bad IS NOT NULL THEN
        RAISE EXCEPTION
            'coach_time_claims backfill HALTED: legacy overlap would release a booking or an enrolled programme — manual review required. Offending sources: %',
            v_bad;
    END IF;

    -- ── 4. Insert claims: winners active, losers released-with-audit ────────
    INSERT INTO coach_time_claims
        (coach_profile_id, claim_date, start_time, end_time,
         source_type, source_id, slot_index, state, released_at, release_reason)
    SELECT coach_profile_id, claim_date, start_time, end_time,
           source_type, source_id, slot_index,
           CASE WHEN keep THEN 'active' ELSE 'released' END,
           CASE WHEN keep THEN NULL ELSE now() END,
           CASE WHEN keep THEN NULL ELSE 'legacy_overlap_backfill' END
    FROM _claim_candidates;

    -- ── 5. Review log ────────────────────────────────────────────────────────
    SELECT count(*),
           count(*) FILTER (WHERE keep),
           count(*) FILTER (WHERE NOT keep),
           count(*) FILTER (WHERE source_type = 'booking'),
           count(*) FILTER (WHERE source_type = 'programme_session')
      INTO v_total, v_active, v_released, v_bookings, v_sessions
      FROM _claim_candidates;

    RAISE NOTICE 'coach_time_claims backfill: % claims inserted (% active, % released as legacy_overlap_backfill; % from bookings, % from programme sessions)',
        v_total, v_active, v_released, v_bookings, v_sessions;
END;
$$;

COMMIT;
