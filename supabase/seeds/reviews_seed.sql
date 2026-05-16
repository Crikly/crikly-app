-- =====================================================================
-- DB-REVIEWS-SEED — seed reviews + 1 coach reply for the demo coach
-- =====================================================================
-- Target coach: 18369fae-ad5b-4dbe-9108-3bd150c90df8
-- Environment: hosted dev Supabase (gzehxfnlfogkhadejowo) — NEVER run on prod.
--
-- Idempotency: this script first removes any existing SEEDED reviews
-- (identified by booking_id IS NULL AND reviewer_user_id IS NULL on this
-- coach) before inserting fresh rows. Real production reviews — which
-- would have booking_id + reviewer_user_id set — are untouched.
-- coach_replies for seeded reviews are cleaned up via ON DELETE CASCADE
-- on coach_replies.review_id.
--
-- Execution:
--   Option A — Supabase SQL editor: paste this file's contents and run
--              (recommended — clean audit trail in the project history).
--   Option B — CLI (requires DATABASE_URL pointing at hosted dev):
--     psql "$DATABASE_URL" -f supabase/seeds/reviews_seed.sql
--
-- After execution, refresh /coach/reviews (once the stub API is replaced
-- with a real query under API-COACH-REVIEWS-REAL-WIRING).
-- =====================================================================

BEGIN;

-- ── 1. Clean prior seed rows for idempotency ─────────────────────────
-- booking_id IS NULL AND reviewer_user_id IS NULL identifies our seeded
-- rows. CASCADE on coach_replies.review_id cleans replies automatically.

DELETE FROM reviews
WHERE coach_profile_id = '18369fae-ad5b-4dbe-9108-3bd150c90df8'
  AND booking_id IS NULL
  AND reviewer_user_id IS NULL;

-- ── 2. Insert 7 reviews + 1 coach reply atomically ───────────────────
-- created_at uses NOW() - INTERVAL so the "N days/weeks/months ago"
-- ladder stays correct whenever the seed is re-run. The coach reply
-- timestamp is offset 4 hours after the parent review for realism.

WITH new_reviews AS (
  INSERT INTO reviews
    (coach_profile_id, booking_id, reviewer_user_id, rating, comment,
     reviewer_name, sport_name, is_visible, created_at)
  VALUES
    ('18369fae-ad5b-4dbe-9108-3bd150c90df8', NULL, NULL, 5,
     'My son has improved so much after just 8 sessions. The drills are well-structured and the coach explains each technique clearly. Highly recommend!',
     'Sarah Johnson', 'Cricket', true, NOW() - INTERVAL '2 days'),

    ('18369fae-ad5b-4dbe-9108-3bd150c90df8', NULL, NULL, 5,
     'Fantastic coach. Patient, knowledgeable, and great with young players. My daughter looks forward to every session without fail.',
     'Marcus Khan', 'Cricket', true, NOW() - INTERVAL '7 days'),

    ('18369fae-ad5b-4dbe-9108-3bd150c90df8', NULL, NULL, 4,
     'Really good sessions overall. Timing was occasionally flexible which could frustrate some parents, but the coaching quality itself was excellent.',
     'Rachel Patel', 'Cricket', true, NOW() - INTERVAL '14 days'),

    ('18369fae-ad5b-4dbe-9108-3bd150c90df8', NULL, NULL, 5,
     'Brilliant at adapting sessions to my son''s level. Started as a complete beginner, now playing in his school team. Could not be happier.',
     'James Mitchell', 'Tennis', true, NOW() - INTERVAL '42 days'),

    ('18369fae-ad5b-4dbe-9108-3bd150c90df8', NULL, NULL, 4,
     'Solid foundations work. Daughter''s grip and footwork have improved a lot since starting. Sessions are well-structured and always on time.',
     'Helen Williams', 'Football', true, NOW() - INTERVAL '90 days'),

    ('18369fae-ad5b-4dbe-9108-3bd150c90df8', NULL, NULL, 3,
     'Coaching was fine but communication outside sessions was slow. Took two days to reply about rescheduling. Sessions themselves were good.',
     'Omar Hassan', 'Cricket', true, NOW() - INTERVAL '150 days'),

    ('18369fae-ad5b-4dbe-9108-3bd150c90df8', NULL, NULL, 5,
     'One of the best coaches we have found. My son went from nervous beginner to genuinely loving cricket. The patience and encouragement are outstanding.',
     'Priya Ramanathan', 'Cricket', true, NOW() - INTERVAL '240 days')
  RETURNING id, reviewer_name
)
INSERT INTO coach_replies (review_id, coach_profile_id, reply_text, created_at, updated_at)
SELECT id,
       '18369fae-ad5b-4dbe-9108-3bd150c90df8',
       'Thank you so much! It has been a genuine pleasure working with your daughter. She has made brilliant progress with her stance and timing.',
       NOW() - INTERVAL '7 days' + INTERVAL '4 hours',
       NOW() - INTERVAL '7 days' + INTERVAL '4 hours'
FROM new_reviews
WHERE reviewer_name = 'Marcus Khan';

-- ── 3. Recompute coach_profiles rating columns ───────────────────────
-- Computed from actual rows rather than hardcoded so the values stay
-- correct if seed data is altered later. ROUND to numeric(3,2) precision.

UPDATE coach_profiles
SET rating_count = (
      SELECT COUNT(*) FROM reviews
      WHERE coach_profile_id = '18369fae-ad5b-4dbe-9108-3bd150c90df8'
        AND is_visible = true
    ),
    rating_avg = (
      SELECT ROUND(AVG(rating)::numeric, 2) FROM reviews
      WHERE coach_profile_id = '18369fae-ad5b-4dbe-9108-3bd150c90df8'
        AND is_visible = true
    )
WHERE id = '18369fae-ad5b-4dbe-9108-3bd150c90df8';

COMMIT;

-- ── 4. Post-execution sanity check (run separately after COMMIT) ─────
--
-- SELECT reviewer_name, rating, sport_name,
--        EXTRACT(DAY FROM (NOW() - created_at))::int AS days_ago
-- FROM reviews
-- WHERE coach_profile_id = '18369fae-ad5b-4dbe-9108-3bd150c90df8'
-- ORDER BY created_at DESC;
--
-- SELECT rating_avg, rating_count FROM coach_profiles
-- WHERE id = '18369fae-ad5b-4dbe-9108-3bd150c90df8';
-- Expected (for 7 seeded reviews with no real reviews mixed in):
--   rating_avg = 4.43, rating_count = 7
