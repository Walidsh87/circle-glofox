# Deploy pass — 2026-06-11 (migrations 028–053 + env + vendor consoles)

Prod is running current code (`main` auto-deploys) but the **database is missing migrations 028–053** — everything shipped since June 8 is dark until they run. This walks prod to current state, in order.

**✅ Already done (no action needed):**
- Code deployed & healthy on Vercel (200, full security headers verified)
- Crons already registered in `vercel.json` (billing-reminders 05:00 · automations 06:00 · sequences 06:15 UTC)
- **Step 1 ✅ 2026-06-11** — backup taken: `~/circle-glofox-backups/prod-2026-06-11.sql` (411KB, 60 tables)
- **Step 2 ✅** — probe baseline confirmed (26 × false)
- **Step 3 ✅ — ALL 26 MIGRATIONS (028–053) APPLIED TO PROD** via docker psql; probe 26 × true; all four sanity checks passed (phone_e164 normalizing correctly)
- **Step 6 (public half) ✅** — gym page `/functional-fitness` + both embed widgets 200; embeds iframable (`frame-ancestors *`)
- 🔑 Rotate the DB password when convenient (it passed through chat): Settings → Database → Reset — the app is unaffected (uses API keys)

**⛔ Blocked (skip for now, not on the critical path):**
- WhatsApp sender setup + `TWILIO_WHATSAPP_FROM` env — Circle Fitness hasn't provided the mobile number yet. When asking: the number gets **disconnected from the regular WhatsApp app** once registered, so they should dedicate a number, not the front-desk phone's. Everything WhatsApp shows "not configured" until then — nothing breaks.

**Safety:** all 26 migrations are additive and idempotent — re-running a chunk after an error is safe. Rollbacks: [ROLLBACKS.md](../../migrations/ROLLBACKS.md). Paste any SQL error to Claude verbatim; don't improvise.

---

## ✅ STEP 1 — Manual backup (DONE 2026-06-11)

Free tier has no automated backups, so take a one-off dump before touching the DB.

1. Supabase Dashboard → **Connect** (top bar) → **Connection String** → copy the **Session pooler** URI (port **5432**). Looks like:
   `postgresql://postgres.<project-ref>:<PASSWORD>@aws-0-<region>.pooler.supabase.com:5432/postgres`
   (If it shows `[YOUR-PASSWORD]`, replace it with the DB password — reset it there if you don't have it.)
2. In your own terminal, run (paste your real string between the quotes):

```bash
docker run --rm postgres:17 pg_dump --no-owner --no-privileges \
  "PASTE_CONNECTION_STRING_HERE" > ~/circle-glofox-backups/prod-2026-06-11.sql
```

3. Verify: `ls -lh ~/circle-glofox-backups/` → file should be **at least a few hundred KB**. Tell Claude the size.

---

## ✅ STEP 2 — State probe (DONE — baseline was 26 × false)

Supabase Dashboard → **SQL Editor** → paste & run the probe below. **Expected: all 26 rows `false`.** If any row is `true`, stop and tell Claude.

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

---

## ✅ STEP 3 — Migrations, 4 chunks (DONE 2026-06-11 — probe 26 × true, sanity checks green)

For each chunk: open the listed files from the repo's `migrations/` folder, paste their contents **in numeric order** into one SQL Editor run, execute. Then re-run the Step-2 probe — that chunk's rows must flip to `true`. Then run the one-line sanity check. Report to Claude after each chunk.

- [ ] **Chunk A (028–034):** `028_tv_token` · `029_workout_scaling` · `030_member_outreach` · `031_class_waitlist` · `032_member_achievements` · `033_membership_freeze` · `034_member_fields`
  (033 replaces the `cron_eligible_memberships` function — expected.)
  Sanity: `SELECT COUNT(*) FROM class_waitlist;` → `0`

- [ ] **Chunk B (035–040):** `035_membership_plans` · `036_trial_plans` · `037_member_tags` · `038_households` · `039_booking_policies` · `040_skill_levels`
  Sanity: `SELECT booking_close_minutes, late_cancel_hours FROM boxes LIMIT 1;` → `0, 0`

- [ ] **Chunk C (041–046):** `041_broadcasts` · `042_email_campaigns` · `043_automations` · `044_sequences` · `045_sms_campaigns` · `046_whatsapp`
  Sanity: `SELECT COUNT(*) FROM profiles WHERE unsubscribe_token IS NULL;` → `0`

- [ ] **Chunk D (047–053):** `047_inbox` · `048_follow_up_tasks` · `049_referrals` · `050_member_source` · `051_checklists` · `052_wa_inbound` · `053_phone_e164`
  Sanity: `SELECT phone, phone_e164 FROM profiles WHERE phone IS NOT NULL LIMIT 5;` → `+9715xxxxxxxx` for valid UAE mobiles, `NULL` otherwise

**When the probe shows 26 × `true`, the DB is current. Tell Claude — most features are live at this point.**

---

## ▶︎ STEP 4 — Vercel env vars (you, ~10 min) ← YOU ARE HERE

Vercel → Project → Settings → Environment Variables → add to **Production**. Then **redeploy** (env changes need it).

| Var | Enables | Where to get it |
|---|---|---|
| `ANTHROPIC_API_KEY` | AI workout parser | console.anthropic.com → API Keys |
| `RESEND_WEBHOOK_SECRET` | email open/click analytics | Resend → Webhooks → Add endpoint `https://circle-glofox-rep.vercel.app/api/webhooks/resend` (events: opened, clicked, bounced, complained) → copy signing secret |
| `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` | SMS campaigns | Twilio Console home |
| `TWILIO_SMS_FROM` | SMS campaigns | Twilio alphanumeric sender ID (UAE sender-ID registration) |
| ~~`TWILIO_WHATSAPP_FROM`~~ | ⛔ blocked | waiting on the gym's number |

Already set (skip): Supabase keys, Stripe keys, `RESEND_API_KEY`, `CRON_SECRET`, `PORTAL_SIGN_SECRET`, `NEXT_PUBLIC_APP_URL`.
Missing vars degrade gracefully — you can add Twilio later without breaking anything.

---

## ▶︎ STEP 5 — Vendor consoles (you)

- [ ] **Resend (5 min):** Settings → enable **open + click tracking** on the sending domain. (Webhook endpoint was added in Step 4.)
- [ ] **Twilio SMS:** register/confirm the UAE alphanumeric sender ID. No callback console step — the app passes it per-message.
- [ ] ⛔ **Twilio WhatsApp — blocked on the gym's number.** When it arrives: (1) WhatsApp sender registration via Twilio (includes Meta business verification, multi-day); (2) create templates in Twilio Content Editor → after Meta approval paste each `HX…` Content SID into **/dashboard/whatsapp**; (3) set the sender's **inbound webhook** to `https://circle-glofox-rep.vercel.app/api/webhooks/twilio-wa-inbound` (POST, exact URL — signature check depends on it); (4) set `TWILIO_WHATSAPP_FROM` in Vercel (Production + Preview) → redeploy.

---

## ▶︎ STEP 6 — Post-deploy smoke

**Claude verifies (public, no login):** prod 200 + headers · `/embed/lead/<slug>` · `/embed/schedule/<slug>` · `/<slug>` gym page · `/tv/<token>` once generated. → Give Claude the gym slug.

**You click through (authed dashboard):**
- [ ] Settings → generate TV token → open the TV link
- [ ] WOD form → add a scaling tier → visible on whiteboard/TV
- [ ] `/dashboard/retention` → at-risk list renders, "Mark contacted" works
- [ ] Payments → create a plan in the catalog · freeze/unfreeze a membership
- [ ] Member profile → safety fields, tag, skill belt, household (owner)
- [ ] Broadcasts → send a test email to yourself (opens/clicks fill in after Step 5 Resend)
- [ ] Automations + Sequences → create one each (enabled) → confirm tomorrow's 06:00/06:15 runs
- [ ] SMS page loads (sending needs Step 4 Twilio creds)
- [ ] Inbox → message a member · reply as the member from `/dashboard/messages`
- [ ] Tasks → add a follow-up from a lead row and a member profile
- [ ] Referrals → member's refer link · `/dashboard/referrals` counts
- [ ] `/dashboard/attribution` renders
- [ ] Checklists → define steps in Settings → tick on a member profile
- [ ] Lead widget → submit a test lead via `/embed/lead/<slug>` → appears in Leads (source "widget")
- [ ] ⛔ WhatsApp end-to-end — after the sender exists

---

## Rollback

Reverse order per [ROLLBACKS.md](../../migrations/ROLLBACKS.md) (`053` first). Prefer restoring the Step-1 dump over manual drops for anything involving data.

## Standing recommendation (audit R2)

Free tier = no automated backups for a business holding payment + medical-adjacent data. Before more real members onboard: **Supabase Pro** (daily backups + PITR). Until then, re-run the Step-1 dump before any future migration batch.
