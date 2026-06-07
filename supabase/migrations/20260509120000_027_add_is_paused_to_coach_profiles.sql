-- C-Settings-01-DB: add is_paused flag to coach_profiles for the Settings page pause/unpause control.
--
-- Semantics:
--   true  = coach hidden from search results (paused — not discoverable to parents)
--   false = coach visible (default — appears in search if is_profile_live = true)
--
-- Behaviour rules:
--   - Existing confirmed/pending bookings always continue regardless of pause state
--   - New bookings are blocked indirectly: paused coaches don't appear in search,
--     so parents cannot reach the booking flow for them
--   - Toggle is reversible — coach can unpause at any time without admin involvement
--
-- RLS: no new policies needed. coach_profiles existing column-agnostic RLS covers
-- this column (own-record SELECT/UPDATE; public SELECT only when is_profile_live=true).

ALTER TABLE coach_profiles
  ADD COLUMN IF NOT EXISTS is_paused boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN coach_profiles.is_paused IS
  'Coach-controlled visibility pause. true = hidden from search results. Existing bookings continue regardless. Default false (visible). Set via Settings page; admin override unrelated to is_suspended.';
