-- ============================================================
-- Migration: Add slug column to boxes
-- Run once in Supabase SQL Editor.
-- Safe to re-run — all steps use IF NOT EXISTS / DO NOTHING.
-- ============================================================

-- Step 1: Add the column (nullable first so existing rows don't break)
ALTER TABLE boxes ADD COLUMN IF NOT EXISTS slug text;

-- Step 2: Unique index (handles the unique constraint safely)
CREATE UNIQUE INDEX IF NOT EXISTS boxes_slug_unique ON boxes (slug) WHERE slug IS NOT NULL;

-- Step 3: Format check constraint (drop first if exists to avoid 42710 error)
ALTER TABLE boxes DROP CONSTRAINT IF EXISTS boxes_slug_format;
ALTER TABLE boxes ADD CONSTRAINT boxes_slug_format
  CHECK (slug ~ '^[a-z0-9-]{3,40}$');

-- Step 4: Check current state — shows your gym's slug
SELECT id, name, slug, created_at FROM boxes ORDER BY created_at;
