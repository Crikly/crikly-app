-- Migration 047: Add adult_age to platform_config
-- Created: 2026-07-27
-- Task: P-01 (Block 1 parent schema foundations) — GAP-P-04 (REQ-P-017, REQ-P-019)
-- Description: Admin-configurable adult age. Drives player eligibility
--   (migration 048), the child→player conversion trigger (Block 12 / P-23),
--   and the child/adult boundary. Single global value for Phase 1;
--   extensible to per-region later (REQ-P-019).
--
-- Deprecation note: platform_config.child_transition_age (default 16, seeded
--   in migration 003) is SUPERSEDED by adult_age — the conversion trigger now
--   fires at the adult age (REQ-P-005/019). The column is kept (not dropped)
--   because src/types/database.ts still carries it and dropping a config
--   column is not required for Block 1. Marked deprecated in
--   docs/03_DATABASE_SCHEMA.md; removal is a future cleanup migration.
--
-- Range check: an admin typo (e.g. 180) would silently block ALL player
--   registration via the migration-048 trigger, so the value is bounded to a
--   plausible legal-adulthood range. UK Phase 1 uses 18.
--
-- RLS: no policy changes — platform_config policies (migration 003) already
--   cover the new column (SELECT for authenticated users; writes are
--   service-role only).
--
-- Risk: 🟢 Low in isolation (additive column, single-row config table).
--   Part of P-01 which is 🔴 overall. Approved by Lasith in Step 0.
--
-- Down migration:
--   ALTER TABLE platform_config DROP COLUMN adult_age;

ALTER TABLE platform_config
    ADD COLUMN adult_age integer NOT NULL DEFAULT 18
    CONSTRAINT platform_config_adult_age_range CHECK (adult_age BETWEEN 16 AND 25);
