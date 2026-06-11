-- migrations/055_task_assignee.sql
-- Task assignee (#60): optional staff assignment on follow-up tasks.
-- Null = shared pool (all pre-existing tasks keep working unchanged).
-- Run in Supabase SQL Editor. Idempotent.

ALTER TABLE follow_up_tasks
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES profiles(id) ON DELETE SET NULL;
