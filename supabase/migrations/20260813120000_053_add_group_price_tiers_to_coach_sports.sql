-- Migration 053: Add group_price_tiers to coach_sports (CF-PRICE-01 Phase 1)
-- Created: 2026-08-13
-- Description: Coaches can offer group sessions priced as a TOTAL per group
--   size (not per head). Tiers live in one JSONB map on coach_sports:
--     {"2": 4500, "3": 5500}   -- group size -> total price in pence
--   Keys are group sizes as strings "2".."6"; values are integer pence.
--   A size the coach has not set is unavailable to parents.
--
-- Design (approved by Lasith, CF-PRICE-01 Step 0, 13 Aug 2026):
--   - JSONB over a child table: at most 5 entries, always read/written
--     atomically with its coach_sports row, inherits the row's RLS — a child
--     table would add FK + RLS + API surface for no gain.
--   - Deep validation (key range 2-6, integer pence >= 100, keys bounded by
--     max_group_size) lives at the API layer; the DB guards only the type so
--     a malformed write can never make the column non-object.
--   - Legacy columns price_group_pence and max_group_size are NOT touched.
--     price_group_pence stays dormant (P-02); max_group_size is reused as the
--     coach's group-size cap (2-6, API-enforced).
--
-- Risk: 🟡 additive — one new nullable column + type CHECK. No existing
--   column, data, constraint, index, or RLS policy is altered. Existing rows
--   stay NULL, which the UI treats as "group disabled" (clean no-op).

ALTER TABLE coach_sports
  ADD COLUMN IF NOT EXISTS group_price_tiers jsonb NULL;

-- Type guard only — NULL passes, anything non-object is rejected.
ALTER TABLE coach_sports
  ADD CONSTRAINT coach_sports_group_price_tiers_is_object
  CHECK (group_price_tiers IS NULL OR jsonb_typeof(group_price_tiers) = 'object');

COMMENT ON COLUMN coach_sports.group_price_tiers IS
  'Group pricing tiers: JSONB map of group size ("2".."6") to TOTAL session
   price in integer pence, e.g. {"2": 4500, "3": 5500}. NULL = group sessions
   not offered. Sizes absent from the map are unavailable to parents. Deep
   validation (key range, pence minimum, keys <= max_group_size) is enforced
   by the coach_sports API (CF-PRICE-01).';
