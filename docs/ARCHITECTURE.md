# Architecture — Circle Fitness

How the system is built and how the pieces fit together. This is the **what/how-it-fits**;
the **why** lives in [`decisions/`](../decisions/) (ADRs), **how it scales** in
[`docs/ops/scaling-playbook.md`](ops/scaling-playbook.md), and **how it's audited** in
[`docs/audit/CHECKLIST.md`](audit/CHECKLIST.md).

> **Keep this current:** the diagrams are [Mermaid](https://mermaid.js.org) (text → renders on
> GitHub/VSCode). When you add an external service, a top-level route group, a cron/webhook, or a
> new data domain, update the relevant view here. A polished export of View 1 lives at
> [`architecture.png`](architecture.png) for the README / decks.

**Stack (locked):** Next.js 16 App Router + TypeScript (strict) · Supabase (Postgres + Auth + RLS) ·
Tailwind/shadcn · Vercel. Multi-tenant: one codebase serving many gyms ("boxes"), isolated by `box_id` in Postgres RLS.

---

## 1. System context

Who uses it and what it talks to. One Next.js app on Vercel is the only compute; one Supabase Postgres is the only datastore; everything else is an integration behind `src/lib/*`.

```mermaid
flowchart TB
  subgraph users["People"]
    ATH["Athlete (member)"]
    STAFF["Owner · Admin · Coach · Receptionist"]
    PUB["Public visitor / lead"]
  end

  MOB["Circle Mobile<br/>Expo / React Native (separate repo)<br/>native-first hybrid"]

  APP["Circle Fitness<br/>Next.js 16 App Router on Vercel<br/>(Server Components + Server Actions)"]

  subgraph ext["External services (behind src/lib/*)"]
    SUPA[("Supabase<br/>Postgres + Auth + RLS")]
    STRIPE["Stripe<br/>billing · checkout · webhooks"]
    RESEND["Resend<br/>transactional + campaigns"]
    TWILIO["Twilio<br/>SMS + WhatsApp"]
    ANTH["Anthropic<br/>AI WOD parser"]
    UPSTASH["Upstash Redis<br/>rate limiting"]
    PUSH["Web Push (VAPID)"]
    SENTRY["Sentry<br/>errors (PII-scrubbed)"]
  end

  ATH --> APP
  ATH --> MOB
  STAFF --> APP
  PUB -->|"login · /join · /embed · /quote · /tv · /checkin"| APP

  MOB -->|"member JWT · /api/app/* + /app/checkout-return"| APP
  MOB -->|"supabase-js on-device (anon key, RLS)"| SUPA

  APP -->|"@supabase/ssr · RLS + service role"| SUPA
  APP -->|"checkout · portal · refund"| STRIPE
  APP --> RESEND
  APP --> TWILIO
  APP -->|"parse programming"| ANTH
  APP -->|"per-IP / per-user limits"| UPSTASH
  APP --> PUSH
  APP --> SENTRY

  STRIPE -.->|"signed webhook"| APP
  RESEND -.->|"open/click/bounce (svix)"| APP
  TWILIO -.->|"delivery + inbound WA"| APP
```

---

## 2. Request lifecycle — the house shape

Almost all writes flow through a **server action** with the same pipeline. The discipline is: *validate → guard → bind tenant from session → tenant-scoped query → revalidate → return `{ error }`*. There are four entry types — user actions, provider webhooks, crons, and the member-JWT mobile API.

```mermaid
flowchart TB
  subgraph a["① Server Action ('use server')"]
    direction TB
    A1["Read input"] --> A2["Validate (Zod, _lib/validation.ts)"]
    A2 --> A3["Auth + role guard<br/>page-guards / action-guards · getUser()"]
    A3 --> A4["Bind box_id from the session row<br/>(NEVER from the URL/input)"]
    A4 --> A5{"RLS bypass<br/>needed?"}
    A5 -->|no| A6["RLS client<br/>@/lib/supabase/server"]
    A5 -->|yes| A7["Service client + explicit box_id filter<br/>@/lib/supabase/service"]
    A6 --> A8["Postgres: RLS enforces box_id = auth_box_id()"]
    A7 --> A8
    A8 --> A9["revalidatePath → return { error: string | null }"]
  end

  subgraph w["② Provider webhook (/api/webhooks/*)"]
    direction TB
    W1["Verify signature<br/>Stripe constructEvent · svix · Twilio"] --> W2["Idempotency gate<br/>claimEvent / api_idempotency_keys"]
    W2 --> W3["Service client, box-scoped writes"]
  end

  subgraph c["③ Cron (/api/cron/*, Vercel Scheduler)"]
    direction TB
    C1["Bearer CRON_SECRET<br/>(constant-time compare)"] --> C2["Service client across boxes,<br/>each query box-scoped"]
  end

  subgraph m["④ Member-JWT mobile API (/api/app/*)"]
    direction TB
    M1["withMemberAuth: Bearer Supabase JWT<br/>→ box_id + role from the caller's OWN profile row"] --> M2["Handler (Zod-validated body),<br/>service client pinned to that box + user"]
  end
```

See [`docs/loop/ACCESS-CONTROL.md`](loop/ACCESS-CONTROL.md) for the **G ⊆ P** rule (guard roles ⊆ RLS-policy roles) every action/page must satisfy, and [ADR 001](../decisions/001_service_role_key_is_server_only.md) for why the service-role key is server-only.

---

## 3. Multi-tenant isolation — the prime invariant

One gym = one **box**. Isolation is enforced in **Postgres RLS**, not application code. App-layer `.eq('box_id', …)` filters are defense-in-depth, never the sole guard.

```mermaid
flowchart TB
  REQ["Authenticated request<br/>(JWT → auth.uid())"]

  subgraph clients["Two DB clients"]
    RLS["RLS client (authenticated role)<br/>every query filtered by policy"]
    SVC["Service client (service_role)<br/>bypasses RLS — guarded + box-filtered in app"]
  end

  subgraph pg["Postgres (one database)"]
    HELP["SECURITY DEFINER helpers<br/>auth_box_id() · auth_role() · auth_is_staff/manager/programming()<br/>(search_path pinned)"]
    POL["RLS policies on every tenant table<br/>USING box_id = auth_box_id()"]
    DATA[("Tenant rows<br/>every table has box_id NOT NULL")]
  end

  REQ --> RLS --> POL
  REQ --> SVC -.->|"RLS off — app must add .eq('box_id', …)"| DATA
  POL --> HELP
  POL --> DATA
  HELP --> DATA
```

**Enforced (not just advised):** the `rls-isolation` CI gate (`tests/rls/run.mjs`) replays the schema on a throwaway Postgres and asserts cross-box reads/writes are denied; `verify-policy-roles` + `access-control-table` hold the G⊆P alignment. PII columns on `profiles` (medical, national ID) are revoked at the column-grant level — only the service role reads them.

---

## 4. Module map

App Router with a **feature-folder** convention: each dashboard feature owns its `_actions` (server actions), `_components` (client UI), and `_lib` (pure validators). Cross-feature logic + integrations live in `src/lib`. A modular monolith by deliberate choice ([ADR 002](../decisions/002_modular_monolith_no_microservices.md)).

```mermaid
flowchart LR
  subgraph app["src/app"]
    PUBSURF["Public surfaces<br/>[gymSlug] · auth · join · onboarding<br/>embed · quote · portal · tv · checkin · unsubscribe<br/>app/checkout-return (mobile Stripe trampoline)"]
    DASH["dashboard/* (~50 features, role-tiered)<br/>members · schedule · whiteboard · wod · programming<br/>program + program-store · skill-bests · goals<br/>payments · invoices · kpi · reports · inbox · automations · …<br/>each: _actions / _components / _lib"]
    API["api/*<br/>v1 (public REST) · app (member-JWT mobile) · cron · webhooks<br/>calendar · pdpl · gym · health"]
  end

  subgraph lib["src/lib (shared)"]
    PURE["Pure logic (unit-tested)<br/>credits · proration · consistency · percentage<br/>sms · email-blocks · attribution · lifecycle · …"]
    INTEG["Integrations<br/>psp (Stripe) · email (Resend) · twilio · push<br/>rate-limit (Upstash) · supabase · audit · portal-token"]
    AUTH["auth/<br/>page-guards · action-guards · roles"]
    I18N["i18n/ (en + ar, RTL)"]
  end

  PUBSURF --> AUTH
  DASH --> AUTH
  DASH --> PURE
  DASH --> INTEG
  API --> INTEG
  API --> PURE
  INTEG --> AUTH
```

**Convention:** a feature is `dashboard/<feature>/{page.tsx, _actions/*.ts, _components/*.tsx, _lib/validation.ts}`. Validators are pure (`string | null`) and unit-tested; integrations are isolated so a provider swap touches one `src/lib` module.

---

## 5. Data domains

78 tables in one Postgres, grouped by domain. **Every tenant table carries `box_id NOT NULL` referencing `boxes` (ON DELETE CASCADE)** and an RLS policy. Person-scoped rows reference `profiles` with a deliberate `ON DELETE` rule (CASCADE for own data, SET NULL for authorship — [migration 088](../migrations/088_member_removal_fk_cleanup.sql)).

```mermaid
flowchart TB
  BOX[("boxes<br/>(the tenant)")]

  subgraph identity["Identity & compliance"]
    profiles["profiles · households · leads"]
    agree["waivers · terms · parq (+ signatures)<br/>audit_log · portal_access_log · pdpl_exports"]
  end
  subgraph billing["Membership & billing"]
    bill["membership_plans · memberships · invoices<br/>credit_notes · payment_events · billing_reminders<br/>packages · package_credits · quotes · quote_line_items"]
  end
  subgraph classes["Classes & booking"]
    cls["class_templates · class_instances<br/>bookings · class_waitlist"]
  end
  subgraph prog["Programming & performance"]
    pr["workouts(+templates) · workout_scores · score_reactions<br/>athlete_lifts(+history) · member_programs (incl. published<br/>Program Store templates) · program_sessions · program_exercises<br/>program_set_logs · goals · training_plans · movement_videos<br/>athlete_skill_bests · athlete_bar_speed_sets (camera VBT —<br/>analyzed on-device in circle-mobile; video never leaves the<br/>phone, only derived numbers are stored)<br/>achievements · class_debriefs"]
  end
  subgraph ops["Coaching & ops"]
    op["coach_availability · coach_time_off · pay_rates · pay_adjustments<br/>timecards · pt_sessions · sub_requests · member_notes · coach_notes"]
  end
  subgraph crm["CRM & comms"]
    cm["automations(+runs) · sequences(+enrollments/sends)<br/>broadcasts · email/sms/wa campaigns(+recipients/templates)<br/>conversations · messages · push_subscriptions<br/>follow_up_tasks · outreach · tags · checklists"]
  end
  subgraph plat["Platform / public API"]
    pl["api_keys · api_idempotency_keys<br/>webhook_subscriptions · webhook_deliveries"]
  end

  BOX --> identity & billing & classes & prog & ops & crm & plat
  profiles -.->|"athlete_id / coach_id"| billing & classes & prog & ops
```

*(Diagram shows representative tables per domain; the full 78-table list is the grouping above. Migration history + reverse procedures: [`migrations/`](../migrations/) + [`ROLLBACKS.md`](../migrations/ROLLBACKS.md).)*

---

## 6. Background work — crons & webhooks

Unattended work runs as **Vercel-scheduled crons** (authenticated by `CRON_SECRET`) and **inbound provider webhooks** (signature-verified + idempotent). Both use the service client and scope every query by box.

```mermaid
flowchart LR
  subgraph crons["Vercel Cron → /api/cron/*"]
    CR1["billing-reminders (06:00ish)"]
    CR2["automations (06:00)"]
    CR3["sequences (06:15)"]
    CR4["class-reminders (07:00 digest)"]
    CR5["webhook-deliveries (retry)"]
  end
  subgraph hooks["Provider → /api/webhooks/*"]
    H1["stripe (constructEvent)"]
    H2["resend (svix: open/click/bounce)"]
    H3["twilio (SMS delivery)"]
    H4["twilio-wa (WA delivery/read)"]
    H5["twilio-wa-inbound (member replies)"]
  end

  CR1 --> RESEND2["Resend"]
  CR2 --> RESEND2
  CR3 --> RESEND2
  CR4 --> PUSH2["Web Push + Resend"]
  CR5 --> OUT["outbound webhook_subscriptions"]

  H1 --> DB[("Postgres<br/>service client, box-scoped")]
  H2 --> DB
  H3 --> DB
  H4 --> DB
  H5 --> DB
```

There's also a **public REST API** (`/api/v1/*`: members, memberships, classes, bookings, leads, packages, `openapi.json`) authenticated by hashed `api_keys`, and per-athlete **ICS calendar** feeds (`/api/calendar/[token]`) and **PDPL export** (`/api/pdpl/export`).

The **member-JWT mobile API** (`/api/app/*`: profile, membership + buy/pay-now, bookings, agreements, plan-change, referral, calendar-token, pack + program checkout) serves the Circle Mobile app; each route runs through `withMemberAuth` (View 2 ④). Mobile Stripe checkouts return via the public `/app/checkout-return` trampoline (strict custom-scheme allowlist → deep-link back into the app), and mobile **self-signup** is provisioned by a `SECURITY DEFINER` trigger on `auth.users` (migration 087 — box chosen server-side from the `self_signup_default` flag, never from client input).

---

## Maintenance

| When you… | Update |
|---|---|
| Add an external service | View 1 + the Stack line |
| Add a top-level route group under `src/app` | View 4 |
| Add a cron or webhook | View 6 |
| Add a table / data domain | View 5 |
| Make a durable architectural ruling | a new ADR in `decisions/` (then link it here) |

*Last grounded against the codebase: 2026-07-05.*
