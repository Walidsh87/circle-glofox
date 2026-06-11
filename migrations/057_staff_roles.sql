-- migrations/057_staff_roles.sql
-- Granular staff roles (#57), part 1: enum values only.
-- MUST be applied (committed) before 058 — Postgres cannot USE a new enum
-- value in the same transaction that adds it. Idempotent.
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'admin';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'receptionist';
