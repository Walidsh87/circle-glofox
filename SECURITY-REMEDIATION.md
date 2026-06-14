# Circle-Fitness — Security Remediation Work-Order

**Source:** security audit, 2026-06-14. **Tenant key:** `box_id` (a gym = a "box").
**Status of the codebase:** tenant isolation is fundamentally sound (RLS on every table, `box_id` from session, signed webhooks). No fix below is a rewrite. This closes specific holes and adds a regression gate.

## How to use this doc (read first)

- Work top-to-bottom: **HIGH → MEDIUM → LOW → operational → CI gate**.
- **Every DB change is a new forward migration** (`migrations/070…`). Do **not** edit applied migrations. Each is idempotent and self-registers in the ledger if you follow the existing pattern in earlier files. Add a `ROLLBACKS.md` entry for each.
- **Dry-run discipline (same as `019_rls_hardening.sql`):** wrap each migration in `BEGIN; … ROLLBACK;`, run the probe at the bottom of the migration as a planted athlete, confirm expected output, then change `ROLLBACK`→`COMMIT`.
- **Deploy ordering matters for the PII fix (W3)** — see the Deploy Sequence section. Ship the app change before running that migration, exactly like the `019` deploy note.
- After all code changes: `npm run lint && npm run type-check && npm run test && npm run test:coverage` must be green.

---

## W1 — [HIGH] Lock down `cron_eligible_memberships` (active cross-tenant leak)

**Why:** It's a `SECURITY DEFINER` function returning memberships, member emails, and prices **across all boxes** (built for the cron service role). It has no `REVOKE`, so `PUBLIC` — which includes `authenticated` — can call it over PostgREST RPC (`POST /rest/v1/rpc/cron_eligible_memberships`). Any logged-in gym member can pull every other gym's roster. Your `consume_credit`/`refund_credit` already do this correctly (`023:36-39`); this function was missed.

**Files:** `migrations/010_billing_reminders.sql:25`, `migrations/033_membership_freeze.sql:9` (definition); fix ships in new migration `070` below.

**Fix:** included in migration `070` (W2) — `REVOKE EXECUTE … FROM PUBLIC; GRANT … TO service_role;`

**Acceptance:** `SELECT has_function_privilege('authenticated','cron_eligible_memberships(date)','EXECUTE');` returns `f`. The cron routes (service role) still work.

---

## W2 — [HIGH] Pin `search_path` on every `SECURITY DEFINER` function

**Why:** `auth_box_id()` / `auth_role()` gate **all** of RLS, and neither (nor any other definer function) sets `search_path`. A definer function with a mutable path resolves unqualified names against the caller's path, and `pg_temp` is always searched first — so a planted `pg_temp.profiles` could make `auth_box_id()` return an attacker's box, collapsing isolation everywhere. Affected: `auth_box_id`, `auth_role`, `auth_is_staff/manager/programming`, `create_default_waiver/terms/parq`, `cron_eligible_memberships`, and any others.

**File to create:** `migrations/070_security_hardening.sql`

```sql
-- migrations/070_security_hardening.sql
-- Closes two findings from the 2026-06-14 audit:
--   HIGH  cron_eligible_memberships: SECURITY DEFINER, cross-box, EXECUTE-able by PUBLIC.
--   HIGH  every SECURITY DEFINER function lacks a pinned search_path.
-- Idempotent. DRY RUN: wrap in BEGIN; … ROLLBACK; run the probes, then COMMIT.

-- 1) Lock the cross-tenant cron RPC to the service role only (W1).
REVOKE EXECUTE ON FUNCTION cron_eligible_memberships(date) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION cron_eligible_memberships(date) TO service_role;

-- 2) Pin search_path on EVERY SECURITY DEFINER function in `public` that lacks one.
--    Generates one ALTER per function from the catalog — no need to touch bodies.
--    `public, extensions` keeps unqualified table refs + extension funcs resolvable
--    while removing pg_temp from the front of the path.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname AS schema, p.proname AS name,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef AND p.proconfig IS NULL
  LOOP
    EXECUTE format('ALTER FUNCTION %I.%I(%s) SET search_path = public, extensions',
                   r.schema, r.name, r.args);
  END LOOP;
END $$;

-- ---- PROBES (expect the commented results) ----
-- (a) no definer function left unpinned:
--   SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--   WHERE n.nspname='public' AND p.prosecdef AND p.proconfig IS NULL;     -- 0 rows
-- (b) cron RPC no longer public:
--   SELECT has_function_privilege('authenticated','cron_eligible_memberships(date)','EXECUTE'); -- f
```

**Note / optional stronger form:** the gold standard is `SET search_path = ''` with every in-body name fully qualified (`public.profiles`, etc.). The `ALTER` approach above closes the vulnerability with near-zero breakage risk and no body edits. If you want the strict form, do it per-function using the bodies already in the repo, and verify each still runs.

**Acceptance:** probe (a) returns 0 rows; app boots; RLS still isolates (W7 gate proves it).

---

## W3 — [HIGH] Stop broadcasting member medical / national-ID PII to co-members

**Why:** `profiles` has one read policy — `box_isolation_select` (box-wide). Migrations `034` (blood type, allergies, DOB, emergency contacts) and `065` (`id_type`, `id_number` = Emirates ID/passport) added sensitive columns with **no column revoke and no self/staff split** (the migration comments claiming "self" are wrong — confirmed there is no self-narrowing policy). Any athlete can `select *` and read every co-member's medical data and government ID. PDPL exposure (Federal Decree-Law 45/2021). Mirror exactly what `019` did for the Stripe secret on `boxes`.

> ⚠️ **Column GRANTs are role-based (`authenticated`), not app-role-based** — `owner`/`coach`/`athlete` are all `authenticated` in Supabase. So after this migration, **no client (staff included) can read these columns via the anon/RLS client** — only the service role. You must reroute any client read of these columns through a service-role action **before** running the migration.

**Step 3a — find and reroute client reads (do this first):**
```bash
grep -rn "blood_type\|allergies\|date_of_birth\|emergency_contact\|id_number\|id_type" src --include=*.ts --include=*.tsx
```
For each hit that selects these columns via the **RLS** client (`@/lib/supabase/server`/`client`), move it to a **service-role** read inside an existing staff-gated action (the member-detail/`updateMember` path already uses the service client — extend it). If any athlete self-view shows their own PII, add a small service-role self-read action (guarded to `id = user.id`).

**Step 3b — file to create:** `migrations/071_profiles_pii_lockdown.sql`
```sql
-- migrations/071_profiles_pii_lockdown.sql
-- HIGH: medical + government-ID columns on profiles are readable by every co-member.
-- Mirrors the column-REVOKE pattern migration 019 used for boxes.stripe_secret_key.
-- After this, the listed PII columns are readable ONLY via the service role.
-- DEPLOY ORDER: ship the app change (PII reads via service role, W3a) BEFORE this.
-- DRY RUN: BEGIN; … ROLLBACK; run the probe, then COMMIT.

DO $$
DECLARE allow text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ')
  INTO allow
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'profiles'
    AND column_name NOT IN (
      'blood_type','allergies','date_of_birth',
      'emergency_contact_name','emergency_contact_phone',
      'id_type','id_number'
    );
  REVOKE SELECT ON public.profiles FROM anon, authenticated;
  EXECUTE format('GRANT SELECT (%s) ON public.profiles TO authenticated', allow);
  -- anon intentionally gets no columns (public pages read profiles via service role).
END $$;

-- ---- PROBE (as a planted athlete; expect permission-denied on the PII columns) ----
--   SELECT blood_type, id_number FROM profiles LIMIT 1;   -- ERROR: permission denied for column
--   SELECT full_name FROM profiles LIMIT 1;               -- still works (roster/feed names)
```

**Optional cleaner end-state (follow-up, not required now):** move the seven PII columns into a `member_sensitive` table (`profile_id` PK, `box_id`) with RLS that *can* express self-or-staff (`profile_id = auth.uid()` OR `box_id = auth_box_id() AND auth_role() IN ('owner','coach')`). This restores athlete self-access through the normal client while still blocking co-members — which column GRANTs can't do. Bigger migration; schedule it post-launch.

**Acceptance:** athlete probe denies the 7 columns; `full_name` still readable; member-detail page (staff) and any self-view still render PII (via service role).

---

## W4 — [HIGH, operational] Rotate / segregate `.env.local` secrets

**Why:** `.env.local` holds live-looking secrets — a `service_role` JWT (project `qmhkmmonizkibxitcavs`, bypasses all RLS), Resend key, `PORTAL_SIGN_SECRET`, `CRON_SECRET`, VAPID private key. It is gitignored and **not** in git (verified) — good — but if these are production or shared with it, a service-role key is sitting in plaintext on the dev machine.

**Actions (no code):**
1. Determine: is `qmhkmmonizkibxitcavs` / the Resend key prod or a throwaway dev project?
2. If prod/shared: **rotate all** — Supabase service-role + anon (dashboard → API → roll), Resend key, `CRON_SECRET`, `PORTAL_SIGN_SECRET`, VAPID keypair. Treat the current values as compromised.
3. Point local dev at a **separate** Supabase project with non-prod data.
4. Confirm Vercel injects prod secrets via its env store (Production vs Preview scopes), not a synced file.

---

## W5 — [MEDIUM] Rate-limit the public quote pay/accept flow

**Why:** `/quote/[token]` pay/accept are unauthenticated, service-role, and create Stripe customers + membership rows. `/quote` is missing from the rate-limit prefix list. The token is high-entropy `randomUUID` (verified — so no enumeration), but an attacker holding one valid link can spray Stripe `createCustomer` calls and DB writes (cost/abuse amplification).

**File:** `src/lib/rate-limit.ts:7` (`RATE_LIMITED_PREFIXES`). Add `'/quote'` (and `'/checkin'` — see W10). Optionally add a tighter per-token limit on `payQuote` since each call can hit the Stripe API.

```ts
// before
const RATE_LIMITED_PREFIXES = ['/api/gym', '/portal', '/auth', '/tv', '/embed']
// after
const RATE_LIMITED_PREFIXES = ['/api/gym', '/portal', '/auth', '/tv', '/embed', '/quote', '/checkin']
```

**Acceptance:** rapid repeated POSTs to a `/quote/<token>` action get 429 (with Upstash configured).

---

## W6 — [LOW] Close cross-tenant push injection via `sendMessage`

**Why:** `sendMessage(memberId, body)` is a server action callable from client composers with an arbitrary `memberId`. The conversation/message writes are RLS-scoped (safe), but `sendPushTo(service, athleteId, …)` (`src/lib/push.ts:17`) uses the **service role** and queries `push_subscriptions` by `athlete_id` with **no box filter** — so staff at gym A can push attacker-controlled text to a member at gym B (and learn whether a UUID has devices).

**Fixes (both):**
1. `src/app/dashboard/inbox/_actions/send-message.ts` — before any side effect, when caller is staff, verify the target is in the caller's box using the RLS client:
   ```ts
   const { data: t } = await supabase.from('profiles').select('id')
     .eq('id', targetMemberId).eq('box_id', caller.box_id).maybeSingle()
   if (!t) return { error: 'Member not found.' }
   ```
2. `src/lib/push.ts` — add a `boxId` param to `sendPushTo` and filter:
   ```ts
   .from('push_subscriptions').select('id, endpoint, p256dh, auth')
     .eq('athlete_id', athleteId).eq('box_id', boxId)
   ```
   Update callers to pass the caller/session box. (Confirm `push_subscriptions` has `box_id`; migration `060`. If not, scope via a join on `profiles`.)

**Acceptance:** calling `sendMessage` with an out-of-box UUID returns "Member not found"; no push is sent.

---

## W7 — [LOW] Constant-time compare for the cron secret

**Why:** cron routes compare with `!==` (timing-leaky). Your `portal-token.ts` already uses `crypto.timingSafeEqual` — reuse that.

**Files:** `src/app/api/cron/automations/route.ts:20`, `billing-reminders/route.ts:26`, `class-reminders/route.ts:18`, `sequences/route.ts:16`.

```ts
import { timingSafeEqual } from 'node:crypto'
const expected = Buffer.from(`Bearer ${env.CRON_SECRET}`)
const got = Buffer.from(request.headers.get('authorization') ?? '')
if (got.length !== expected.length || !timingSafeEqual(got, expected)) {
  return new Response('Unauthorized', { status: 401 })
}
```
Factor into one helper (e.g. `src/lib/cron-auth.ts`) and call from all four.

---

## W8 — [LOW] Add the missing `box_id` clause to athlete-own RLS policies

**Why:** defense-in-depth; not exploitable today (these ids are single-box) but inconsistent with every sibling policy. Read the current policy bodies first and confirm names.

**File to create:** `migrations/072_rls_defense_in_depth.sql`
```sql
-- migrations/072_rls_defense_in_depth.sql
-- LOW: pin box_id on athlete-own SELECT policies + fix over-permissive reaction delete.
-- Confirm policy names against 012_vat_invoices.sql / 013_credit_notes.sql /
-- 047_inbox.sql / feed-progress-migration.sql before running. Idempotent. DRY RUN first.

DROP POLICY IF EXISTS athlete_own_invoices ON invoices;
CREATE POLICY athlete_own_invoices ON invoices
  FOR SELECT USING (athlete_id = auth.uid() AND box_id = auth_box_id());

DROP POLICY IF EXISTS athlete_own_credit_notes ON credit_notes;
CREATE POLICY athlete_own_credit_notes ON credit_notes
  FOR SELECT USING (athlete_id = auth.uid() AND box_id = auth_box_id());

DROP POLICY IF EXISTS conversations_member_select ON conversations;
CREATE POLICY conversations_member_select ON conversations
  FOR SELECT USING (member_id = auth.uid() AND box_id = auth_box_id());

-- score_reactions: members were able to DELETE others' reactions in their box.
-- Replace the implicit-FOR-ALL self_write with explicit own-scoped insert + delete
-- (box-wide SELECT stays via the existing box_read policy).
DROP POLICY IF EXISTS self_write ON score_reactions;
CREATE POLICY reactions_self_insert ON score_reactions
  FOR INSERT WITH CHECK (athlete_id = auth.uid() AND box_id = auth_box_id());
CREATE POLICY reactions_self_delete ON score_reactions
  FOR DELETE USING (athlete_id = auth.uid() AND box_id = auth_box_id());
```
**Caution:** if `conversations` has member INSERT/UPDATE policies, preserve them — only the SELECT policy is being re-created here.

---

## W9 — [LOW] Use validated env for `PORTAL_SIGN_SECRET`

**Why:** two sites use `process.env.PORTAL_SIGN_SECRET ?? ''` instead of the Zod-validated `env.PORTAL_SIGN_SECRET` — a footgun if the Zod check is ever removed.

**Files:** `src/app/api/webhooks/stripe/route.ts:179`, `src/app/dashboard/payments/page.tsx:316`. Replace with `env.PORTAL_SIGN_SECRET`; drop the `?? ''`.

---

## W10 — [LOW] Rate-limit the public check-in page

Add `'/checkin'` to `RATE_LIMITED_PREFIXES` (done together with W5). Minimal exposure (login required to act), included for completeness.

---

## W11 — [INFO] Verify, don't assume

- **Rate limiter is a no-op without Upstash creds and fails open on outage.** Confirm prod has `UPSTASH_REDIS_REST_URL`/`_TOKEN` (or Vercel `KV_*`) set — otherwise there is **no** rate limiting in prod.
- **`leads` table:** its `CREATE` lives in an early migration not in `migrations/` (001–007). Verify against the live DB that RLS is on and policies are staff-scoped:
  ```sql
  SELECT relrowsecurity FROM pg_class WHERE relname='leads';  -- expect t
  SELECT polname, pg_get_expr(polqual,polrelid) FROM pg_policy WHERE polrelid='leads'::regclass;
  ```
- **Stripe webhook** brute-forces every box's secret per event — O(boxes) `constructEvent`. Fine now; revisit if tenant count gets large.

---

## W12 — [HIGH-value] Wire an automated tenant-isolation gate (the one real gap vs. the standard)

You've hand-run 69 migrations with **no automated test proving isolation still holds** (`package.json` has no `test:rls`/`test:e2e`/`migrations:status`, unlike the starter). This is the highest-leverage thing to add.

1. Port `saas-starter/tests/rls/run.mjs` → `circle-fitness/tests/rls/run.mjs`; swap `org_id`→`box_id`, `organizations`→`boxes`, `profiles` role enum to `owner/coach/athlete`. Seed **two** boxes + an athlete in each; assert cross-box SELECT/UPDATE/DELETE affect 0 rows, cross-box INSERT raises `42501`, and in-box positive controls pass. Apply the **real** migrations to a throwaway Postgres (the starter shows the `auth-shim.sql` + `SET ROLE authenticated` pattern).
2. Add probes that lock in this work-order: cron RPC is **not** PUBLIC-executable (W1), the PII columns deny for a planted athlete (W3), and no definer function is unpinned (W2).
3. Add `"test:rls": "node tests/rls/run.mjs"` to `package.json` and a CI workflow (port `saas-starter/.github/workflows/ci.yml`): lint → type-check → test:coverage, plus `gitleaks`, `npm audit --audit-level=high`, and the `rls-isolation` job. Require these checks on `main`.

---

## Deploy sequence (do not reorder)

1. **Ship app changes first:** W3a (PII reads via service role), W5/W10, W6, W7, W9. Get CI green.
2. Run **`070`** (W1+W2) — no app dependency, safe.
3. Run **`072`** (W8) — safe.
4. Run **`071`** (W3) **only after** step 1 is deployed (else staff PII reads 500 on the revoked columns — same hazard as the `019` deploy note).
5. **W4:** rotate/segregate secrets.
6. **W12:** land the RLS gate so all of the above can never silently regress.
7. **W11:** confirm Upstash in prod; verify `leads` RLS live.

## Final acceptance checklist

- [x] `070` **applied to prod + verified 2026-06-14** — 0 unpinned definer functions; `cron_eligible_memberships` no longer EXECUTE-able by `authenticated`/`anon` (dry-run caught that `REVOKE … FROM PUBLIC` alone was insufficient — Supabase grants those roles directly; migration revokes them explicitly). `service_role` still works.
- [x] App PII reads **rerouted through service role (W3a, shipped + reviewed)**; `071` **applied to prod + verified 2026-06-14** (after the W3a deploy went live) — all 7 PII columns now deny SELECT for `authenticated` + `anon`; `full_name`/`box_id`/`phone` still readable by `authenticated`; `anon` gets no columns. Staff/self PII views render via the service role.
- [x] `072` **applied to prod + verified 2026-06-14** — `score_reactions.box_read` narrowed to `FOR SELECT` (corrected from the draft, which left box-wide DELETE open); reaction writes own-scoped; athlete-own SELECT policies box-pinned; conversations member-insert/update/staff preserved.
- [x] `/quote` + `/checkin` rate-limited; cron uses constant-time compare; `sendPushTo` box-scoped + `sendMessage` in-box guard; `env.PORTAL_SIGN_SECRET` used. (Shipped + reviewed, gate green.)
- [ ] **W4** — Secrets rotated (if prod) and dev pointed at a separate Supabase project; Upstash set in prod. *(operational — owner)*
- [x] **W12** — `tests/rls/run.mjs` ported + **green (27/27, verified against docker Postgres 16)**: replays `schema.sql` + all migrations, asserts cross-box SELECT/UPDATE/DELETE=0 + INSERT=42501 + in-box positive controls, plus W1/W2/W3 hardening probes. `test:rls` script + `pg` devDep added; CI jobs added (`rls-isolation`, `supply-chain`=`npm audit --audit-level=high`, `secret-scan`=gitleaks). **Surfaced prod drift:** `leads` table + `boxes.logo_url` exist in prod but are created by NO committed SQL (DR rebuild incomplete) — reconstructed CI-only in the harness; reconcile into numbered migrations as follow-up. **Remaining (GitHub UI, owner):** mark `ci`/`rls-isolation`/`supply-chain`/`secret-scan` as **required status checks** in branch protection on `main`.
- [x] `npm run lint && type-check && test && test:coverage` all green (1084 tests; coverage 88.9/81.8/91.1/89.8 ≥ thresholds).
- [x] `ROLLBACKS.md` entries added for `070`–`072`.
