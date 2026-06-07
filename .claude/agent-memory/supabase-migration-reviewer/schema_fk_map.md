---
name: Schema FK Target Map
description: FK relationships and ON DELETE behaviours for key tables — cross-reference for every REFERENCES clause in migrations
type: reference
---

Key FK relationships verified from docs/03_DATABASE_SCHEMA.md and originating migrations:

## group_programme_sessions
- group_programme_id → group_programmes(id) ON DELETE CASCADE
- coach_venue_id → coach_venues(id) ON DELETE SET NULL

## group_programmes
- coach_profile_id → coach_profiles(id) ON DELETE CASCADE
- sport_id → sports(id) [no ON DELETE clause — defaults to RESTRICT]

## group_programme_enrolments
- group_programme_id → group_programmes(id) ON DELETE CASCADE
- child_profile_id → child_profiles(id) ON DELETE SET NULL
- player_profile_id → player_profiles(id) ON DELETE SET NULL
- booked_by_user_id → user_profiles(id) [no explicit ON DELETE]

## coach_session_types
- coach_sport_id → coach_sports(id) ON DELETE CASCADE

## coach_venues
- coach_profile_id → coach_profiles(id) ON DELETE CASCADE

## bookings
- coach_profile_id → coach_profiles(id)
- sport_id → sports(id)
- booked_by_user_id → user_profiles(id)
- child_profile_id → child_profiles(id)
- player_profile_id → player_profiles(id)

## reviews (migration 029 changes)
- booking_id → bookings(id) ON DELETE SET NULL (nullable — was required before 029)
- coach_profile_id → coach_profiles(id) ON DELETE CASCADE (was RESTRICT before 029)
- reviewer_user_id → user_profiles(id) ON DELETE SET NULL (nullable since 029)

## coach_replies
- review_id → reviews(id) ON DELETE CASCADE, UNIQUE
- coach_profile_id → coach_profiles(id) ON DELETE CASCADE

## user_profiles
- auth_user_id → auth.users(id) ON DELETE CASCADE

## child_profiles
- parent_profile_id → parent_profiles(id)

## General pattern
- Money/booking tables: prefer RESTRICT or SET NULL — never blanket CASCADE on booking/payment data
- Schedule/session tables subordinate to a parent programme: CASCADE is acceptable (session rows are meaningless without the programme)
