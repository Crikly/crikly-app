-- Migration 029: Extend reviews + create coach_replies
-- =====================================================================
-- Task: DB-REVIEWS-SCHEMA
-- Description:
--   1. Loosen FK behaviour on `reviews` so the table supports seeded data
--      (booking_id and reviewer_user_id become nullable; their FKs become
--      ON DELETE SET NULL) and coach-profile deletion (coach_profile_id
--      becomes ON DELETE CASCADE).
--   2. Add `reviewer_name` and `sport_name` columns to `reviews`. Both are
--      NOT NULL with safe defaults so existing rows (none expected in any
--      environment as the parent review API is not yet wired) stay valid.
--   3. Add an index on reviews(created_at DESC) for newest-first sorts.
--   4. Add a coach-specific SELECT policy so coaches can see their own
--      reviews even when hidden (existing public policy only covers
--      is_visible = true).
--   5. Create `coach_replies` table (one reply per review, enforced by
--      UNIQUE(review_id)), with RLS for coach SELECT/INSERT/UPDATE and a
--      public SELECT policy gated on the parent review being visible.
--
-- Risk: 🔴 High — modifies existing FK constraints and drops NOT NULL on
--   a Phase-1 schema. Reviewed and approved by Lasith on 2026-05-16.
--
-- Lifecycle notes:
--   - GDPR right-to-erasure × CASCADE: deleting a coach_profile now
--     destroys all their reviews + replies. Acceptable for Phase 1.
--     Follow-up: BUG-REVIEWS-FK-LIFECYCLE — revisit when soft-delete on
--     coach_profiles is introduced.
--   - UNIQUE(booking_id): retained from migration 007. Postgres treats
--     NULL as distinct, so seeded rows (nullable booking_id) are not
--     constrained — real booking-linked reviews remain one-per-booking.
--   - Service-role INSERT on `reviews`: not added as an explicit policy
--     because service role bypasses RLS by default (matches pattern in
--     migration 007 for performance_reports seed/admin flows).
-- =====================================================================

BEGIN;

-- ── 1. Extend reviews — FK constraint changes ──────────────────────────

-- Drop NOT NULL on booking_id so seeded reviews can omit it
ALTER TABLE reviews ALTER COLUMN booking_id DROP NOT NULL;

-- Drop NOT NULL on reviewer_user_id so seeded reviews can omit it
ALTER TABLE reviews ALTER COLUMN reviewer_user_id DROP NOT NULL;

-- booking_id: RESTRICT → SET NULL
ALTER TABLE reviews DROP CONSTRAINT reviews_booking_id_fkey;
ALTER TABLE reviews ADD CONSTRAINT reviews_booking_id_fkey
    FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL;

-- reviewer_user_id: RESTRICT → SET NULL
ALTER TABLE reviews DROP CONSTRAINT reviews_reviewer_user_id_fkey;
ALTER TABLE reviews ADD CONSTRAINT reviews_reviewer_user_id_fkey
    FOREIGN KEY (reviewer_user_id) REFERENCES user_profiles(id) ON DELETE SET NULL;

-- coach_profile_id: RESTRICT → CASCADE
ALTER TABLE reviews DROP CONSTRAINT reviews_coach_profile_id_fkey;
ALTER TABLE reviews ADD CONSTRAINT reviews_coach_profile_id_fkey
    FOREIGN KEY (coach_profile_id) REFERENCES coach_profiles(id) ON DELETE CASCADE;

-- ── 2. Extend reviews — new columns ────────────────────────────────────

-- Display name shown on the coach reviews page. Independent of
-- reviewer_user_id so seeded data and user-deleted reviews still render.
ALTER TABLE reviews ADD COLUMN reviewer_name text NOT NULL DEFAULT 'Anonymous';

-- Snapshot of the sport at review time. Stored as text (not FK to sports)
-- so historical reviews remain stable if a sport is renamed or removed.
ALTER TABLE reviews ADD COLUMN sport_name text NOT NULL DEFAULT 'Unknown';

-- ── 3. New index for newest-first sort ─────────────────────────────────

CREATE INDEX reviews_created_at_desc_idx ON reviews(created_at DESC);

-- ── 4. RLS — reviews — add coach SELECT policy ─────────────────────────
-- Existing public SELECT policy "Public can view visible reviews" only
-- covers is_visible = true. Coaches need to see their hidden/flagged
-- reviews too, so this additive policy uses USING ... OR pattern at
-- the policy level (Postgres OR's multiple permissive policies).

CREATE POLICY "Coaches can view own reviews"
    ON reviews
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM coach_profiles
            JOIN user_profiles ON user_profiles.id = coach_profiles.user_profile_id
            WHERE coach_profiles.id = reviews.coach_profile_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    );

-- Existing parent INSERT policy "Bookers can create reviews for own
-- bookings" (migration 007) remains in place — Step 4 will exercise it.

-- ── 5. coach_replies table ─────────────────────────────────────────────

CREATE TABLE coach_replies (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    review_id uuid NOT NULL UNIQUE REFERENCES reviews(id) ON DELETE CASCADE,
    coach_profile_id uuid NOT NULL REFERENCES coach_profiles(id) ON DELETE CASCADE,
    reply_text text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
-- Note: review_id is already covered by the implicit B-tree index created
-- by the UNIQUE(review_id) constraint above — no explicit index needed.
CREATE INDEX coach_replies_coach_profile_id_idx ON coach_replies(coach_profile_id);

-- updated_at trigger (function defined in migration 001)
CREATE TRIGGER update_coach_replies_updated_at
    BEFORE UPDATE ON coach_replies
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ── 6. RLS — coach_replies ─────────────────────────────────────────────

ALTER TABLE coach_replies ENABLE ROW LEVEL SECURITY;

-- SELECT (public): a reply is visible to anyone whenever its review is
-- visible. Used by the public coach profile (/coaches/[id]).
CREATE POLICY "Public can view replies for visible reviews"
    ON coach_replies
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM reviews
            WHERE reviews.id = coach_replies.review_id
            AND reviews.is_visible = true
        )
    );

-- SELECT (coach): a coach can see their own replies regardless of
-- review visibility (e.g. a moderated/flagged review where they
-- still need to see what they wrote).
CREATE POLICY "Coaches can view own replies"
    ON coach_replies
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM coach_profiles
            JOIN user_profiles ON user_profiles.id = coach_profiles.user_profile_id
            WHERE coach_profiles.id = coach_replies.coach_profile_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    );

-- INSERT (coach): a coach can reply to a review that targets their own
-- profile. The second EXISTS prevents replying as another coach.
CREATE POLICY "Coaches can reply to own reviews"
    ON coach_replies
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM coach_profiles
            JOIN user_profiles ON user_profiles.id = coach_profiles.user_profile_id
            WHERE coach_profiles.id = coach_replies.coach_profile_id
            AND user_profiles.auth_user_id = auth.uid()
        )
        AND EXISTS (
            SELECT 1 FROM reviews
            WHERE reviews.id = coach_replies.review_id
            AND reviews.coach_profile_id = coach_replies.coach_profile_id
        )
    );

-- UPDATE (coach): a coach can edit their own reply text. The WITH CHECK
-- mirrors the INSERT policy's double-EXISTS guard so a coach cannot
-- UPDATE their reply to reassign it to another coach's review by
-- changing review_id (FAIL-B from migration review on 2026-05-16).
CREATE POLICY "Coaches can edit own replies"
    ON coach_replies
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM coach_profiles
            JOIN user_profiles ON user_profiles.id = coach_profiles.user_profile_id
            WHERE coach_profiles.id = coach_replies.coach_profile_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM coach_profiles
            JOIN user_profiles ON user_profiles.id = coach_profiles.user_profile_id
            WHERE coach_profiles.id = coach_replies.coach_profile_id
            AND user_profiles.auth_user_id = auth.uid()
        )
        AND EXISTS (
            SELECT 1 FROM reviews
            WHERE reviews.id = coach_replies.review_id
            AND reviews.coach_profile_id = coach_replies.coach_profile_id
        )
    );

-- DELETE: no policy = denied. Coaches can blank out the text via UPDATE.

COMMIT;
