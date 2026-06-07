---
name: Schema group_programme_sessions
description: Table history, constraints added in migration 031, and UPSERT reconciliation model — critical context for any future migration touching this table
type: reference
---

Source: docs/03_DATABASE_SCHEMA.md section 6.4 and supabase/migrations/20260331233640_coach_new_tables.sql

## Table origin
- Created in: 20260331233640_coach_new_tables.sql (migration 014a)
- First written to by live code: migration 031 (CF-PROG-SESSIONS-DB) — POST/PATCH routes
  had never written to this table before 031 shipped.

## Constraints as of migration 031
- PRIMARY KEY: id uuid gen_random_uuid()
- FK: group_programme_id → group_programmes(id) ON DELETE CASCADE
- FK: coach_venue_id → coach_venues(id) ON DELETE SET NULL
- CHECK: status IN ('scheduled', 'completed', 'cancelled')
- CHECK (added 031): slots IS NULL OR jsonb_typeof(slots) = 'array'
- UNIQUE (added 031): (group_programme_id, session_date) — enables UPSERT ON CONFLICT

## slots column (added migration 031)
- Type: jsonb NULL
- NULL = single time block, use row's start_time/end_time
- Non-null = camp-mode: array of {"startTime":"HH:MM","endTime":"HH:MM"}
- slots[0] MUST mirror the row's start_time/end_time (convention, enforced by API not DB)
- Per-element shape (HH:MM format) validated server-side in POST/PATCH validators, not at DB level

## camp_mode column (added migration 031, on group_programmes not this table)
- Type: boolean NOT NULL DEFAULT false
- When false: every group_programme_sessions.slots for this programme is NULL
- When true: sessions may carry non-null slots arrays

## UPSERT reconciliation model
- POST: bulk insert every session_date after group_programmes insert; on bulk failure,
  orphan programme row is deleted (atomic from coach POV)
- PATCH (current_spots = 0): delete session_dates no longer in form list,
  then UPSERT remaining with ON CONFLICT (group_programme_id, session_date) DO UPDATE
- PATCH (current_spots > 0): schedule reconciliation skipped, console.info logged

## Important: table was empty before migration 031
- The UNIQUE constraint addition in migration 031 is safe because no rows existed.
- For any FUTURE migration adding constraints to this table: always run the
  pre-check duplicate query before pushing:
    SELECT group_programme_id, session_date, COUNT(*)
    FROM group_programme_sessions GROUP BY 1,2 HAVING COUNT(*) > 1;
