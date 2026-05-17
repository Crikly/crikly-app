-- Migration 030: add image_url to group_programmes
-- =====================================================================
-- Task: CF-PROGRAMMES-IMAGE-PICKER
-- Description: stores the cover photo URL for a group programme.
--   Either a curated Unsplash pick from src/lib/programme-images.ts
--   or a coach-uploaded URL via Supabase Storage. Nullable — existing
--   programmes and any future programme without a chosen image fall
--   back to a sport-based placeholder in the UI.
--
-- Risk: 🟢 Low — additive nullable column, no FK, no RLS change needed
--   (existing group_programmes RLS policies cover all columns).
--
-- Lifecycle: when a coach removes an image, the API PATCHes image_url
--   back to null. Storage cleanup (deleting the underlying object from
--   the programme-images bucket) is out of scope for Phase 1 — file
--   INFRA-PROGRAMME-IMAGES-CLEANUP if orphan files become a problem.
-- =====================================================================

ALTER TABLE group_programmes
  ADD COLUMN IF NOT EXISTS image_url TEXT;

COMMENT ON COLUMN group_programmes.image_url IS
  'Cover photo URL — Unsplash curated pick or coach upload. Null = use sport-based placeholder in UI.';
