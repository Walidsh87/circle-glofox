# PDPL Data Inventory & Retention Policy — Circle Fitness

**Regime:** UAE Personal Data Protection Law — Federal Decree-Law No. 45 of 2021 (PDPL).
**Status:** _Draft — the **owner-to-ratify** items in §3 and §7 are business/legal decisions, not code facts._
**Last grounded against the codebase:** 2026-07-05 (audit run — migs 073–095 folded in).

This is the data-inventory + retention/erasure policy the audit checklist requires
([`docs/audit/CHECKLIST.md`](../audit/CHECKLIST.md) §2.4). It records *what* personal data the platform
holds, *where*, *why*, *who can read it*, *how long* it's kept, and *how a member exercises their rights*.
Each gym (box) is the **data controller** for its members; this platform is the **processor**.

---

## 1. Data inventory

Every category below is tenant-isolated by `box_id` (Postgres RLS, `auth_box_id()`). "Access" = who can read it through the app.

| Category | Where (tables / fields) | Purpose / lawful basis | Access |
|---|---|---|---|
| Identity & contact | `profiles`: full_name, email, phone, `phone_e164`, language, household_id; `auth.users` | Provide the service (contract) | Staff (box-wide) + self |
| **Medical / health** 🔴 | `profiles`: blood_type, allergies, date_of_birth, emergency_contact_name/phone; `parq_responses` | Safety / duty of care (explicit consent) | **Service-role only → staff UI** (column-revoked from `authenticated`, mig 071) + self |
| **Government ID** 🔴 | `profiles`: id_type, id_number (Emirates ID / Passport / Iqama) | Identity verification (legal) | **Service-role only → staff UI** (mig 071); **never logged** |
| Financial | `memberships`, `invoices`, `credit_notes`, `payment_events`, `package_credits`, `quotes` | Billing, **UAE VAT** (legal obligation) | Owner/coach (RLS); self sees own invoices. **No card data** — Stripe holds it; we store only provider refs |
| Attendance & performance | `bookings`, `workout_scores`, `athlete_lifts`(+history), `member_achievements`, `athlete_skill_bests`, `pt_sessions`, `class_waitlist` | Provide the service | Box-wide (RLS) + self *(skill bests: self + staff)* |
| Coaching & training | `member_goals`, `member_training_plans`, `member_programs`/`program_sessions`/`program_exercises`, `program_set_logs`; `class_debriefs` (coach-attributed recaps) | Provide the service | Staff + self (own rows) |
| Staff notes about members | `member_notes` (call/visit/post-class log, author snapshot), `athlete_coach_notes` (scaling notes), `member_outreach` (retention contacts) | Service / duty of care (legitimate interest) | **Staff only — never member-visible in-app**, but disclosable in a DSAR |
| Agreements | `waiver_signatures`, `terms_signatures`, `parq_responses` — incl. **IP address + user-agent** at signing | Liability / contract (legal) | Staff + self |
| Communications | `profiles.marketing_opt_out` + `unsubscribe_token`; `messages`, `conversations`; `broadcast/sms/wa_recipients`, `push_subscriptions` (device endpoints) | Service + marketing (consent / opt-out) | Staff + self (own thread) |
| CRM / leads | `leads`: name, email, phone, source, referred_by | Pre-contract enquiry (legitimate interest) | Staff |
| Platform API / egress | `api_keys` (created_by ref, hashed key), `webhook_subscriptions` + `webhook_deliveries` — **member-event JSON payloads sent to owner-configured third-party URLs** | Integrations (owner-directed) | Owner; ⚠️ webhook targets are an **egress channel the owner controls** — treat each configured endpoint as a data recipient |
| Security & accountability | `audit_log`, `portal_access_log`, `pdpl_exports` | Security, breach detection (legal obligation) | Owner only (append-only) |

> The member **data-subject access export** (`buildPdplExport`, `/api/pdpl/export`) covers: profile (incl. medical + ID), memberships, bookings, lifts, scores, skill bests, waiver + terms signatures, billing reminders, PAR-Q responses, **invoices + credit notes, in-app/WhatsApp messages, staff notes (member_notes + coach scaling notes + outreach), goals, training plans, programs + set logs, PT sessions, achievements, package credits, and waitlist entries** (extended 2026-07-05). **Deliberately not exported:** comms *delivery* logs (`broadcast/sms/wa_recipients` — send-status metadata; the message content is in the campaign, not per-member), `push_subscriptions` (device endpoint tokens), and `leads` (lead rows are deleted on conversion, so a member has none; an unconverted lead's data is just name/email/phone/source — handle ad-hoc if requested). Staff-authored notes ARE included — PDPL access rights cover opinions recorded about the subject.

---

## 2. Sub-processors (where data leaves the platform)

| Sub-processor | Data shared | Purpose | Notes |
|---|---|---|---|
| **Supabase** | All of the above | Database + Auth (primary store) | Data residency / region — **owner to confirm** (PDPL cross-border transfer rules) |
| **Stripe** | Name, email, **card data**, amounts | Payments | Card data never touches our servers (PCI handled by Stripe); we store provider refs only |
| **Resend** | Name, email, message content | Transactional + marketing email | Bounce/complaint suppression honoured |
| **Twilio** | Phone number, message content | SMS + WhatsApp | Only for members with a phone; opt-out respected |
| **Sentry** | Error context | Error monitoring | **PII-scrubbed** (`beforeSend` / `sentry-scrub.ts`; `sendDefaultPii` off) |
| **Vercel** | Request metadata, IP (logs) | Hosting | — |
| **Upstash** | IP address (ephemeral) | Rate limiting | Short-lived counters only |
| **Anthropic** | **Workout/programming text only** | AI WOD parser (#16) | **No member PII sent** — freeform programming text, opt-in per call |

---

## 3. Retention & deletion — _proposed defaults, owner to ratify_

| Category | Proposed retention | Deletion trigger |
|---|---|---|
| Financial (invoices, credit-notes, VAT) | **5 years** from issue (UAE FTA / VAT record-keeping) | Time-based purge after the statutory period |
| Member personal data (identity, attendance, performance) | Duration of membership **+ 12–24 months** after last activity | Member removal, or inactivity purge |
| Medical / PAR-Q / government ID | While an active member | Erasure request, or membership end + short grace |
| Agreements (waiver/terms/PAR-Q signatures) | Term of relationship + limitation period (liability evidence) | Reviewed at erasure (may be retained for legal defence) |
| Unconverted leads | **N months** then purge | Time-based |
| Marketing opt-out / unsubscribe token | **Indefinite** | Never — required to keep honouring the opt-out (suppression list) |
| Audit logs (`audit_log`, `portal_access_log`) | **≥ 2 years** (security) | Time-based after the security window |

> These periods are **business/legal decisions** — the owner must set the real numbers (and confirm UAE statutory minimums for financial records). No automated retention purge is implemented yet; deletion today is manual/erasure-driven (see §4).

---

## 4. Data-subject rights (how a member exercises them)

| Right | How it's fulfilled today |
|---|---|
| **Access / portability** | Owner-triggered JSON export (`/api/pdpl/export`, `buildPdplExport`); each export is logged in `pdpl_exports`. Coverage extended 2026-07-05 — see §1 note for the deliberate exclusions. |
| **Erasure** | Member removal deletes the `profiles` row → child data CASCADEs / actor refs SET NULL (mig 088); the auth user is deleted. **Financial records are retained** for the legal-obligation period (partial erasure) — document this to the member. |
| **Rectification** | Self-service profile edits (athlete "My details", #77) + staff edit on the member page |
| **Objection / opt-out** | `profiles.marketing_opt_out` + public `/unsubscribe/[token]`; bounce/complaint auto-suppression |

PDPL response window: respond to a verified request within the statutory timeframe — **owner to confirm the current deadline** and the verification step (confirm identity before exporting/erasing).

---

## 5. Security controls (summary)

Tenant isolation by **RLS** (`box_id = auth_box_id()`, gated in CI by `rls-isolation`); medical + government-ID columns **revoked from the `authenticated` role** (service-role-only, mig 071); TLS in transit (Vercel-managed); append-only **audit log**; **MFA** available for staff; rate limiting on public/auth routes. Detail: [`docs/audit/CHECKLIST.md`](../audit/CHECKLIST.md), [`docs/loop/ACCESS-CONTROL.md`](../loop/ACCESS-CONTROL.md).

## 6. Breach response

Follow [`docs/runbooks/disaster-recovery.md`](../runbooks/disaster-recovery.md) §2A (leaked credential / suspected breach): rotate, scope via `portal_access_log` / `pdpl_exports` / `payment_events`, and **assess the PDPL notification duty** to the UAE Data Office + affected members.

## 7. Owner to ratify / open items

- [ ] Confirm the **Supabase region** + whether any cross-border-transfer safeguards are needed (PDPL).
- [ ] Set the **real retention periods** in §3 (and confirm UAE statutory financial minimums).
- [ ] Put **signed DPAs** in place with each §2 sub-processor; record their status.
- [ ] Decide whether a **DPO / data-protection contact** is required and name them.
- [ ] Name the **controller legal entity** per gym (the box owner).
- [x] ~~**Extend the PDPL export** to cover invoices/credit-notes, messages, and lead history~~ — done 2026-07-05 (§1 note lists the coverage + the deliberate exclusions; lead history is N/A per-member since lead rows are deleted on conversion).
- [ ] Ratify the §1 note's **deliberate export exclusions** (delivery logs, push endpoints) and the inclusion of **staff notes** in DSAR responses.
- [ ] Decide on an **automated retention purge** (none today — deletion is manual/erasure-driven).
