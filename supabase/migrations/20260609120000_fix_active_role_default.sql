-- Migration: fix active_role default (Fix-AUDIT-01)
-- Created: 2026-06-09
-- Description:
--   user_profiles.active_role was `text NOT NULL DEFAULT 'parent'` (migration
--   001). Every new account was therefore silently assigned active_role='parent'
--   before ever choosing a role, so the completeness gate's `!active_role` check
--   could never fire and new coaches were routed to the /dashboard stub as
--   "parent". This makes the column nullable with no default, so "no role chosen
--   yet" is represented as NULL, and resets all mis-defaulted users.
--
-- Risk: HIGH — modifies an existing column on a production table.
-- Order matters: NOT NULL must be dropped BEFORE any value can be set to NULL.
-- Wrapped in a transaction so the schema + data change applies atomically
-- (NOTIFY is delivered at COMMIT).

BEGIN;

-- 1. Drop NOT NULL first — required before the UPDATE below can write NULLs.
ALTER TABLE user_profiles
  ALTER COLUMN active_role DROP NOT NULL;

-- 2. Drop the DEFAULT so newly created rows are NULL until a role is selected.
ALTER TABLE user_profiles
  ALTER COLUMN active_role DROP DEFAULT;

-- 3. Reset every user who carries the defaulted 'parent' value. No legitimate
--    parent users exist yet (the parent module is not built and the role
--    chooser only offers Coach), so all active_role='parent' rows are default
--    artifacts. Setting them NULL forces role selection on next login.
UPDATE user_profiles
SET active_role = NULL
WHERE active_role = 'parent';

-- 4. Reload the PostgREST schema cache so the API picks up the column change.
NOTIFY pgrst, 'reload schema';

COMMIT;
