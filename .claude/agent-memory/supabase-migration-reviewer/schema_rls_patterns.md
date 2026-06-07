---
name: Schema RLS Policy Patterns
description: Canonical RLS policy templates used in this codebase — for verifying new table policies match established patterns
type: reference
---

Source: supabase/migrations/20260331233640_coach_new_tables.sql lines 139–368

## group_programme_sessions — canonical coach-ownership pattern

All four operations (SELECT/INSERT/UPDATE/DELETE) for coach-owned sub-tables
join through the parent programme to coach_profiles:

  SELECT: public when parent programme status = 'active'
    USING (EXISTS (SELECT 1 FROM group_programmes gp
                   WHERE gp.id = group_programme_sessions.group_programme_id
                     AND gp.status = 'active'))

  INSERT (coach):
    WITH CHECK (EXISTS (SELECT 1 FROM group_programmes gp
                        JOIN coach_profiles cp ON gp.coach_profile_id = cp.id
                        WHERE gp.id = group_programme_id
                          AND cp.user_profile_id = auth.uid()))

  UPDATE (coach):
    USING (EXISTS (SELECT 1 FROM group_programmes gp
                   JOIN coach_profiles cp ON gp.coach_profile_id = cp.id
                   WHERE gp.id = group_programme_sessions.group_programme_id
                     AND cp.user_profile_id = auth.uid()))

  DELETE (coach): same USING as UPDATE

## group_programmes — direct coach ownership

  SELECT: public when status = 'active'
    USING (status = 'active')

  INSERT/UPDATE/DELETE: coach own only
    EXISTS (SELECT 1 FROM coach_profiles cp
            WHERE cp.id = coach_profile_id [or group_programmes.coach_profile_id]
              AND cp.user_profile_id = auth.uid())

## Key RLS principle in this codebase
- New columns on existing tables do NOT require policy changes — the existing
  policies cover all columns in the row automatically (Postgres RLS is row-level,
  not column-level). Column-level restrictions would require views or separate
  security mechanisms. This is the confirmed pattern for migration 031's slots
  and camp_mode additions.

## user_profiles — public SELECT for live coaches (migration 032, PUB-API-01)

Added in 20260603120000_add_public_select_policy_to_user_profiles.sql.

Policy name: "Public can view user_profiles for live coaches"
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM coach_profiles
      WHERE coach_profiles.user_profile_id = user_profiles.id
        AND coach_profiles.is_profile_live = true
    )
  )

Key notes:
- Gates on coach_profiles.is_profile_live = true (same as existing public coach_profiles policy)
- Does NOT filter coach_profiles.deleted_at — matches existing coach_profiles public policy
  which also defers deleted_at filtering to the API route. This is intentional design.
- Exposes ALL user_profiles columns for matched rows (Postgres row-level only).
  Sensitive columns now readable by anon for live coaches: phone, whatsapp_number,
  location_postcode, location_lat/lng (7dp), active_role, auth_provider,
  terms_accepted_at, deletion_requested_at.
- API route must NOT project lat/lng or deletion_requested_at on public responses.
- Performance: EXISTS uses unique index coach_profiles.user_profile_id_idx — O(1) lookup.
- Pre-existing own-record SELECT policy ("Users can view own profile": auth.uid() = auth_user_id)
  remains in place alongside this new policy.

## Child data access pattern (BR-08)
- child_profiles: parent-only + confirmed-coach SELECT via booking join
- medical_notes in child_profiles: same policy as the row — no separate column
  policy. Visibility controlled by confirming a booking exists.
