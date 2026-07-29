-- Migration 051: Reviews 24-hour edit window
-- Created: 2026-07-27
-- Task: P-01 (Block 1 parent schema foundations) — GAP-P-05 in task brief
--   (REQ-P-067: "Editable for 24h, then locked")
-- Description: Reviews were immutable by design (migration 007: "UPDATE not
--   permitted — reviews are permanent"; no UPDATE policy, no updated_at).
--   This migration WIDENS access: the reviewer may edit their own review for
--   24 hours after created_at, after which it locks again (no policy match
--   → denied). Three parts:
--     1. updated_at column + trigger — edits are now possible, so the table
--        needs the standard audit column.
--     2. UPDATE RLS policy — reviewer-owned rows, inside the 24h window.
--     3. Guard trigger — RLS cannot restrict WHICH columns change, so
--        without it a reviewer could re-point their review at another coach
--        (coach_profile_id), another booking, or reset created_at to re-open
--        the window. The guard also stops a reviewer self-unhiding a
--        moderated review (is_visible).
--
-- Guard trigger scoping — auth.uid() IS NOT NULL gate: the guard binds ONLY
--   end-user (authenticated) writes. Service-role writes have
--   auth.uid() = NULL and pass untouched, because:
--     a. FK cascade actions must not be blocked — reviews_booking_id_fkey
--        and reviews_reviewer_user_id_fkey are ON DELETE SET NULL
--        (migration 029); those SET NULL writes fire UPDATE triggers and
--        would otherwise abort the parent delete.
--     b. Admin moderation (is_visible) runs via service role.
--   Service role bypasses RLS by definition, so it gains nothing it did not
--   already have.
--
-- Existing rows: none (reviews = 0 rows in local, staging and production —
--   Step 0, confirmed), so updated_at DEFAULT now() backfills nothing.
--
-- Risk: 🔴 High — RLS widening on user-generated content. Approved by
--   Lasith in Step 0.
--
-- Down migration:
--   DROP TRIGGER guard_review_update_on_write ON reviews;
--   DROP FUNCTION public.guard_review_update();
--   DROP POLICY "Reviewers can edit own reviews within 24 hours" ON reviews;
--   DROP TRIGGER update_reviews_updated_at ON reviews;
--   ALTER TABLE reviews DROP COLUMN updated_at;

BEGIN;

-- ============================================
-- 1. updated_at column + trigger
-- ============================================

ALTER TABLE reviews
    ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

CREATE TRIGGER update_reviews_updated_at
    BEFORE UPDATE ON reviews
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 2. UPDATE policy — reviewer, own row, within 24h
-- ============================================
-- reviewer_user_id is nullable since migration 029 (seeded reviews);
-- NULL-reviewer rows never match, so seeded reviews stay locked.

CREATE POLICY "Reviewers can edit own reviews within 24 hours"
    ON reviews
    FOR UPDATE
    USING (
        reviewer_user_id IS NOT NULL
        AND EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.id = reviews.reviewer_user_id
            AND user_profiles.auth_user_id = auth.uid()
        )
        AND now() < reviews.created_at + interval '24 hours'
    )
    WITH CHECK (
        reviewer_user_id IS NOT NULL
        AND EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.id = reviews.reviewer_user_id
            AND user_profiles.auth_user_id = auth.uid()
        )
        AND now() < reviews.created_at + interval '24 hours'
    );

-- ============================================
-- 3. Guard trigger — column-level immutability for end users
-- ============================================

CREATE OR REPLACE FUNCTION public.guard_review_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- Service role / system writes (FK SET NULL cascades, admin moderation)
    -- pass untouched — see migration header.
    IF auth.uid() IS NULL THEN
        RETURN NEW;
    END IF;

    IF NEW.booking_id IS DISTINCT FROM OLD.booking_id
       OR NEW.coach_profile_id IS DISTINCT FROM OLD.coach_profile_id
       OR NEW.reviewer_user_id IS DISTINCT FROM OLD.reviewer_user_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'REVIEW_IMMUTABLE_FIELDS: booking_id, coach_profile_id, reviewer_user_id and created_at cannot be changed'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.is_visible IS DISTINCT FROM OLD.is_visible THEN
        RAISE EXCEPTION 'REVIEW_VISIBILITY_PROTECTED: is_visible is moderated by the platform'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER guard_review_update_on_write
    BEFORE UPDATE ON reviews
    FOR EACH ROW
    EXECUTE FUNCTION public.guard_review_update();

COMMIT;
