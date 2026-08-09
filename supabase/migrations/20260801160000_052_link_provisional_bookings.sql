-- ═══════════════════════════════════════════════════════════════════════════
-- 052 — P-04-B: atomic guest→account linking
-- ═══════════════════════════════════════════════════════════════════════════
-- Block 0 guest checkout creates provisional user_profiles rows
-- (auth_user_id NULL, is_provisional true — see migration
-- 20260623120000_provisional_user_support.sql) that own bookings and
-- group_programme_enrolments. When the guest later registers a real
-- account and accepts the link offer (Screen 04), ownership of those
-- records must transfer to the new profile atomically.
--
-- Why an RPC and not sequential updates from the API layer: the transfer
-- touches three tables (bookings, group_programme_enrolments,
-- user_profiles) and a partial failure would strand financial records
-- between two owners. A single plpgsql function body runs in one
-- transaction — all or nothing.
--
-- Why SECURITY DEFINER: RLS on bookings/user_profiles compares
-- auth.uid() = auth_user_id, which is NULL for provisional rows — no
-- authenticated user can read or update them (by design). The function is
-- callable ONLY by service_role (the API layer derives every argument
-- server-side from the caller's verified email; nothing client-supplied
-- reaches this function).
--
-- The provisional profile is "upgraded" by re-pointing its records, not by
-- adopting it: user_profiles.auth_user_id is UNIQUE and the auth callback
-- has already seeded a real profile for the new user, so the provisional
-- row is soft-deleted (deleted_at — never hard DELETE; bookings FK is
-- ON DELETE RESTRICT anyway).
--
-- Money columns are never touched — only booked_by_user_id (ownership)
-- moves. group_programme_enrolments has no deleted_at column, hence no
-- soft-delete filter on that UPDATE.

CREATE OR REPLACE FUNCTION public.link_provisional_bookings(
  p_target_profile_id uuid,
  p_provisional_profile_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_valid_ids uuid[];
  v_bookings integer := 0;
  v_enrolments integer := 0;
BEGIN
  -- Target must be a real, live account.
  IF NOT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = p_target_profile_id
      AND is_provisional = false
      AND auth_user_id IS NOT NULL
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'link_provisional_bookings: target profile % is not a linkable account', p_target_profile_id;
  END IF;

  -- Only genuine, live provisional guest profiles may be linked. Anything
  -- else in the input array is silently dropped. FOR UPDATE locks the
  -- matched rows for the duration of the transaction so two concurrent
  -- link calls (e.g. the same guest profile matched from two sessions)
  -- serialise instead of splitting records across two targets — the
  -- second caller then re-reads deleted_at IS NULL as false and no-ops.
  SELECT array_agg(id) INTO v_valid_ids
  FROM (
    SELECT id
    FROM user_profiles
    WHERE id = ANY(p_provisional_profile_ids)
      AND is_provisional = true
      AND auth_user_id IS NULL
      AND deleted_at IS NULL
    FOR UPDATE
  ) AS locked_profiles;

  IF v_valid_ids IS NULL THEN
    RETURN jsonb_build_object('bookings', 0, 'enrolments', 0, 'profiles', 0);
  END IF;

  UPDATE bookings
  SET booked_by_user_id = p_target_profile_id,
      updated_at = now()
  WHERE booked_by_user_id = ANY(v_valid_ids)
    AND deleted_at IS NULL;
  GET DIAGNOSTICS v_bookings = ROW_COUNT;

  UPDATE group_programme_enrolments
  SET booked_by_user_id = p_target_profile_id,
      updated_at = now()
  WHERE booked_by_user_id = ANY(v_valid_ids);
  GET DIAGNOSTICS v_enrolments = ROW_COUNT;

  -- Retire the emptied provisional profiles (soft delete only).
  UPDATE user_profiles
  SET deleted_at = now(),
      updated_at = now()
  WHERE id = ANY(v_valid_ids);

  RETURN jsonb_build_object(
    'bookings', v_bookings,
    'enrolments', v_enrolments,
    'profiles', COALESCE(array_length(v_valid_ids, 1), 0)
  );
END;
$$;

-- Service-role only: the anon/authenticated roles must never call this
-- directly — the API layer owns argument derivation.
REVOKE ALL ON FUNCTION public.link_provisional_bookings(uuid, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.link_provisional_bookings(uuid, uuid[]) FROM anon;
REVOKE ALL ON FUNCTION public.link_provisional_bookings(uuid, uuid[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.link_provisional_bookings(uuid, uuid[]) TO service_role;
