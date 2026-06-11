# Deploy pass — 2026-06-11 (migrations 028–053 + env + vendor consoles)

Everything shipped since 2026-06-08 is in the repo but **not live**: prod is missing migrations **028–053** (26 files), four Vercel env vars, and the Resend/Twilio console wiring. This runbook takes prod from the June-7 state to current `main` (`1de9ced`).

**Safety properties:** every migration is idempotent (`IF NOT EXISTS` / `CREATE OR REPLACE` / `DROP POLICY IF EXISTS`) — re-running a chunk after a mid-paste error is safe. Reverse procedures: [ROLLBACKS.md](../../migrations/ROLLBACKS.md) (highest number first).

**Division of labor:** you run the Supabase SQL Editor / Vercel / vendor consoles (Claude has no access); Claude verifies after each step and runs the public-surface smoke at the end.

---

## Step 0 — Pre-flight (5 min)

1. **Backup check** (audit item R2, do not skip with 26 migrations queued): Supabase Dashboard → Project → Database → Backups. Confirm a backup exists from the last 24h. Note the timestamp. (Free tier = daily, 7-day retention. If the project is on Pro, confirm PITR is on.)
2. **State probe** — paste this in the SQL Editor. Expected result right now: **all 26 rows `false`** (and if any are already `true`, tell Claude before proceeding — it means partial state):

```sql
SELECT migration, applied FROM (
  SELECT '028_tv_token' AS migration, EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='boxes' AND column_name='tv_token') AS applied
  UNION ALL SELECT '029_workout_scaling', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='workouts' AND column_name='scaling')
  UNION ALL SELECT '030_member_outreach', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='member_outreach')
  UNION ALL SELECT '031_class_waitlist', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='class_waitlist')
  UNION ALL SELECT '032_member_achievements', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='member_achievements')
  UNION ALL SELECT '033_membership_freeze', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='memberships' AND column_name='frozen_from')
  UNION ALL SELECT '034_member_fields', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='emergency_contact_name')
  UNION ALL SELECT '035_membership_plans', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='membership_plans')
  UNION ALL SELECT '036_trial_plans', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='membership_plans' AND column_name='is_trial')
  UNION ALL SELECT '037_member_tags', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='member_tags')
  UNION ALL SELECT '038_households', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='households')
  UNION ALL SELECT '039_booking_policies', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='boxes' AND column_name='booking_close_minutes')
  UNION ALL SELECT '040_skill_levels', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='skill_levels')
  UNION ALL SELECT '041_broadcasts', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='broadcasts')
  UNION ALL SELECT '042_email_campaigns', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='email_templates')
  UNION ALL SELECT '043_automations', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='automations')
  UNION ALL SELECT '044_sequences', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='sequences')
  UNION ALL SELECT '045_sms_campaigns', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='sms_campaigns')
  UNION ALL SELECT '046_whatsapp', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='wa_templates')
  UNION ALL SELECT '047_inbox', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='conversations')
  UNION ALL SELECT '048_follow_up_tasks', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='follow_up_tasks')
  UNION ALL SELECT '049_referrals', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='referral_code')
  UNION ALL SELECT '050_member_source', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='source')
  UNION ALL SELECT '051_checklists', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='checklist_items')
  UNION ALL SELECT '052_wa_inbound', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='messages' AND column_name='channel')
  UNION ALL SELECT '053_phone_e164', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='phone_e164')
) p ORDER BY migration;
```

3. **Start Meta/WhatsApp verification now** (Step 3c) — it has multi-day approval lead time; everything else can proceed while it's pending.

---

## Step 1 — Migrations, four chunks

For each chunk: open the listed files from `migrations/` in the repo, paste their contents **in numeric order** into one SQL Editor run, execute, then re-run the state probe above — the chunk's rows must flip to `true`. If a paste errors midway: read the error, fix nothing blindly — re-running the same chunk is safe (idempotent). Report any error to Claude verbatim.

### Chunk 1 — programming, retention, booking depth (028–034)
`028_tv_token` · `029_workout_scaling` · `030_member_outreach` · `031_class_waitlist` · `032_member_achievements` · `033_membership_freeze` · `034_member_fields`

Note: 033 also `CREATE OR REPLACE`s `cron_eligible_memberships` (billing-reminder cron now skips frozen memberships) — replacing the existing function is expected.

Sanity after probe: `SELECT COUNT(*) FROM class_waitlist;` → `0` (not an error).

### Chunk 2 — membership depth (035–040)
`035_membership_plans` · `036_trial_plans` · `037_member_tags` · `038_households` · `039_booking_policies` · `040_skill_levels`

Sanity: `SELECT booking_close_minutes, late_cancel_hours FROM boxes LIMIT 1;` → `0, 0` (policies disabled by default — existing booking behavior unchanged).

### Chunk 3 — comms (041–046)
`041_broadcasts` · `042_email_campaigns` · `043_automations` · `044_sequences` · `045_sms_campaigns` · `046_whatsapp`

Note: 041 backfills `unsubscribe_token` for every existing profile (instant at pilot size).

Sanity: `SELECT COUNT(*) FROM profiles WHERE unsubscribe_token IS NULL;` → `0`.

### Chunk 4 — CRM, inbox, WhatsApp inbound (047–053)
`047_inbox` · `048_follow_up_tasks` · `049_referrals` · `050_member_source` · `051_checklists` · `052_wa_inbound` · `053_phone_e164`

Note: 053 creates the `normalize_uae_phone` SQL function + a generated `profiles.phone_e164` column (auto-computed for all existing rows on ADD COLUMN).

Sanity: `SELECT phone, phone_e164 FROM profiles WHERE phone IS NOT NULL LIMIT 5;` → e164 column shows `+9715xxxxxxxx` for valid UAE mobiles, `NULL` otherwise.

**→ Tell Claude when all 4 chunks are green (final probe = 26 × `true`).**

---

## Step 2 — Vercel env vars (then redeploy)

Vercel → Project → Settings → Environment Variables. Add to **Production** (and Preview where noted). After saving, **trigger a redeploy** — env changes don't apply to the running deployment.

| Var | Enables | Where to get it |
|---|---|---|
| `ANTHROPIC_API_KEY` | #16 AI workout parser | console.anthropic.com → API Keys |
| `RESEND_WEBHOOK_SECRET` | #41 email open/click analytics | Resend → Webhooks → Add endpoint `https://circle-glofox-rep.vercel.app/api/webhooks/resend` (events: opened, clicked, bounced, complained) → copy the signing secret |
| `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` | #42 SMS + #39/#40 WhatsApp | Twilio Console home |
| `TWILIO_SMS_FROM` | #42 SMS campaigns | Twilio alphanumeric sender ID (UAE requires sender-ID registration) |
| `TWILIO_WHATSAPP_FROM` | #39 WA campaigns + #40 inbound | E.164 of the approved WhatsApp sender, **no `whatsapp:` prefix**. Set in **Preview too** |

Already set (no action): Supabase keys, Stripe keys, `RESEND_API_KEY`, `CRON_SECRET`, `PORTAL_SIGN_SECRET`, `NEXT_PUBLIC_APP_URL`.
Crons: already registered in `vercel.json` (billing-reminders 05:00 · automations 06:00 · sequences 06:15 UTC) — live on redeploy, no console step.

Missing vars degrade gracefully (features report "not configured") — you can do Twilio later without breaking anything else.

---

## Step 3 — Vendor consoles

**a) Resend (5 min):** Settings → enable **open + click tracking** on the sending domain. Webhook endpoint added in Step 2. Done.

**b) Twilio SMS:** register/confirm the UAE **alphanumeric sender ID**. No callback console step — the status callback (`/api/webhooks/twilio`) is passed per-message by the app.

**c) Twilio WhatsApp (longest lead time — start first):**
1. Twilio Console → Messaging → **WhatsApp sender** registration (walks through Meta business verification).
2. Once approved: create **message templates** in Twilio Content Editor → submit for Meta approval → paste each approved Content SID (`HX…`) into **/dashboard/whatsapp** in the app.
3. On the WhatsApp sender's configuration: set the **inbound webhook** to `https://circle-glofox-rep.vercel.app/api/webhooks/twilio-wa-inbound` (HTTP POST). ⚠️ The URL must match exactly — signature verification reconstructs it from `NEXT_PUBLIC_APP_URL`.
4. Status callback (`/api/webhooks/twilio-wa`) is passed per-message — no console step.

---

## Step 4 — Post-deploy smoke

**Claude verifies (public surfaces, no login):** prod 200s + security headers; `/embed/lead/<gym-slug>` renders and is iframable; `/embed/schedule/<gym-slug>` renders; `/<gym-slug>` public page; `/tv/<token>` once a token is generated.

**You click (authed dashboard), one pass:**
- [ ] Settings: generate TV token → open the TV link on a screen
- [ ] WOD form: add a scaling tier → shows on whiteboard/TV
- [ ] Retention: `/dashboard/retention` lists at-risk members; "Mark contacted" works
- [ ] Schedule: waitlist join on a full class (or just confirm the page loads)
- [ ] Payments: create a membership plan in the catalog; freeze/unfreeze a membership
- [ ] Member profile: edit safety fields, add a tag, set a skill belt, household card (owner)
- [ ] Broadcasts: send a test email broadcast to yourself → opens/clicks appear after Resend wiring
- [ ] Automations + Sequences: create one of each (enabled) → check tomorrow's 06:00/06:15 cron runs
- [ ] SMS + WhatsApp campaign pages load (sends need Twilio creds from Step 2)
- [ ] Inbox: message a member; reply as the member from `/dashboard/messages`
- [ ] Tasks: create a follow-up task from a lead row and from a member profile
- [ ] Referrals: member profile shows refer-link; `/dashboard/referrals` lists counts
- [ ] Attribution: `/dashboard/attribution` renders the source table
- [ ] Checklists: define onboarding steps in Settings → tick them on a member profile
- [ ] Lead widget: submit a test lead through `/embed/lead/<gym-slug>` → appears in Leads with source "widget"
- [ ] WhatsApp end-to-end (after 3c approval): member texts the WA number → lands in Inbox with WhatsApp badge → staff reply arrives on the member's WhatsApp

---

## Rollback

Reverse order, per [ROLLBACKS.md](../../migrations/ROLLBACKS.md) (`053` first). Prefer PITR/backup restore over manual drops for anything involving data loss.
