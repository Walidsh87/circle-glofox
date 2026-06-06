-- migrations/023_credit_functions.sql
-- Atomic credit consume/refund for the entitlement PR (PR-3). PostgREST can't
-- express `col = col - 1`, so these do the guarded update server-side in one
-- statement. Called ONLY via the service role in book-class / cancel-booking /
-- redeem-session (package_credits has no client write policy — see 020).
-- Run in Supabase SQL Editor. Idempotent. Requires 020.

-- Decrement one credit from a batch IFF it still has one. Returns the new
-- remaining count, or NULL if the batch was already empty (no credit / lost race).
CREATE OR REPLACE FUNCTION consume_credit(p_credit_id UUID)
RETURNS INTEGER
LANGUAGE sql
AS $$
  UPDATE package_credits
     SET credits_remaining = credits_remaining - 1
   WHERE id = p_credit_id
     AND credits_remaining > 0
  RETURNING credits_remaining;
$$;

-- Give one credit back to a batch (cancel, or roll back a failed booking insert).
CREATE OR REPLACE FUNCTION refund_credit(p_credit_id UUID)
RETURNS VOID
LANGUAGE sql
AS $$
  UPDATE package_credits
     SET credits_remaining = credits_remaining + 1
   WHERE id = p_credit_id;
$$;

-- Defense in depth: only the service role may execute these. (RLS on
-- package_credits already blocks client writes, but make intent explicit.)
REVOKE EXECUTE ON FUNCTION consume_credit(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION refund_credit(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION consume_credit(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION refund_credit(UUID) TO service_role;
