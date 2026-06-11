# Tier 6 reports — combined design (#50, #52, #53, #54)

Four reports built as one parallel batch. All read-only over data already live in prod (migrations 028–053 applied 2026-06-11). **Zero migrations.**

**Out of this batch:** #55 payroll (needs a pay-rates data model — separate design question), #56 per-location P&L (premature: single location), #51 churn report (largely covered by `/dashboard/retention` + #18 at-risk scoring; gap reassessed after this batch).

## Shared conventions

- **Owner-only**, via `requireOwnerPage()`. Routes live under `/dashboard/reports/*` with a hub at `/dashboard/reports` (one "Reports" sidebar entry — no per-report nav noise).
- Date range: `?days=30|60|90` (default 30), past classes/leads only. Day bucketing in the box timezone (`box.timezone ?? 'Asia/Dubai'`, `Intl.DateTimeFormat` — same approach as the schedule widget).
- All math in **pure functions** under `src/lib/reports/*.ts` with unit tests (coverage thresholds now include `src/lib/**`). Pages fetch rows and delegate to the lib.
- CSV: shared `src/lib/csv.ts` (`toCsv` — RFC-4180 quoting, BOM for Excel) + `<DownloadCsvButton>` client component. Each report page exports its main table; #54 also wires existing pages.

## #50 Attendance + no-show (`/dashboard/reports/attendance`)

Sources: `class_instances` (starts_at, template) + `class_templates` (name, capacity) + `bookings` (checked_in).
Per past instance: booked, attended (= checked_in), no-shows (= booked − attended).
Page: summary cards (total check-ins, avg attendance/class, overall no-show %); per-template table (classes held, avg attended, fill %, no-show %); busiest-classes ranking. Lib: `buildAttendanceReport(...)`.

## #52 Lead funnel by source (`/dashboard/reports/lead-funnel`)

Sources: `leads` (status, source, created_at, referred_by) + converted members (`profiles.source`). Reuses `sourceKey`/`SOURCE_LABELS` from `src/lib/attribution.ts`.
Funnel per source: leads in range → reached non-new statuses → converted; conversion %. Stage names derive from the **actual lead statuses in the codebase** (not invented).
Lib: `buildLeadFunnel(...)`.

## #53 Instructor / class performance (`/dashboard/reports/classes`)

Sources: same as #50 + `class_templates.coach_id → profiles.full_name` (null → "Unassigned").
Two tables: per coach and per template — classes held, avg fill % (attended/capacity), no-show %, total check-ins. Lib: `buildClassPerformance(...)`.

## #54 CSV export everywhere

`src/lib/csv.ts` + `DownloadCsvButton` (Blob download, client). Wired on: members page, payments page, retention page, and each new report page (by its own agent). Data = the rows the page already fetched; no new queries.
