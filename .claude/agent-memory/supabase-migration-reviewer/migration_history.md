---
name: Migration History: Key Timestamps and Sequence Numbers
description: Known migration timestamps and prefix numbers — used to spot ordering collisions and timestamp anomalies
type: reference
---

Source: supabase/migrations/ directory (observed filenames) and schema doc migration references

## Known migrations (prefix number → filename timestamp)
- 001 → (from schema: 001_create_user_profiles.sql)
- 002 → (from schema: 002_create_profiles.sql)
- 003 → (from schema: 003_create_platform_config.sql)
- 005 → (from schema: 005_create_bookings.sql)
- 006 → (from schema: 006_create_payments.sql)
- 007 → (from schema: 007_create_passport.sql)
- 008 → (from schema: 008_create_subscriptions.sql)
- 014a → 20260331233640_coach_new_tables.sql (creates coach_session_types, coach_venues,
         group_programmes, group_programme_sessions, group_programme_enrolments)
- 015 → (from schema: 015_coach_schema_gaps.sql — adds coach_session_types, coach_venues
         columns per schema doc section references; also group_programme_enrolments)
- 018 → (from schema: adds days_of_week[] to group_programmes — Fix-58)
- 027 → (from schema: adds is_paused to coach_profiles)
- 029 → 029_reviews_coach_replies.sql — DB-REVIEWS-SCHEMA
- 030 → 030_add_image_url_to_programmes.sql — CF-PROGRAMMES-IMAGE-PICKER
- 031 → 20260525120000_031_persist_programme_sessions_and_camp_mode.sql — CF-PROG-SESSIONS-DB
         NOTE: timestamp is 2026-05-25 but was written on 2026-05-22 (3 days ahead).
         Non-blocking but noted for awareness.
- 032 → 20260603120000_add_public_select_policy_to_user_profiles.sql — PUB-API-01
         NOTE: timestamp is 2026-06-03, written on 2026-05-31 (3 days ahead).
         Same forward-timestamp pattern as migration 031. Reviewed and approved.
         Policy-only migration: adds public SELECT on user_profiles for live coaches.

## Naming conventions observed
- Prefix integer (NNN_) is the authoritative sequence identifier
- Timestamp is secondary (used by Supabase CLI for remote ordering)
- Description is snake_case, lowercase, describes what the migration does
- Some migrations use a letter suffix for sub-parts (014a)
- Forward-dating timestamps by ~3 days is an established project pattern (031, 032)

## Next available sequence number
- 033 (as of 2026-05-31)
