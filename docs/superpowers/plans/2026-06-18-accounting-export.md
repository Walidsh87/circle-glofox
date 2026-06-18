# Accounting Export (#67) — Implementation Plan

**Goal:** Manager-tier CSV export of issued invoices (Zoho/Xero/QuickBooks-importable).
**Architecture:** Pure formatter lib + one `/dashboard/reports/accounting` server page; reuse `toCsv`/`DownloadCsvButton`/`requireManagerPage`. No migration.

## Global constraints
- TypeScript strict; no `any` at boundaries.
- Box scoping: RLS (existing `invoices` policy) **and** explicit `.eq('box_id', profile.box_id)`.
- RLS client only (`requireManagerPage()` supabase); never the service client.
- Money: `Number(x).toFixed(2)`. Date: gym timezone `box.timezone`, `YYYY-MM-DD`.
- `?range=` validated against `{30,90,365}` (default 90) before use.
- Reuse: `toCsv` is unused by `DownloadCsvButton` here — the button takes `{filename, headers, rows}` directly.

---

### Task 1: Pure formatter lib + tests
**Files:** Create `src/lib/accounting-export.ts`, `src/lib/accounting-export.test.ts`.

Implement exactly the interface in the spec (`InvoiceRecord`, `ACCOUNTING_HEADERS`, `fmtMoney`, `fmtInvoiceDate`, `toAccountingRow`, `buildAccountingExport`).
- `fmtMoney(v)`: `const n = Number(v); return Number.isFinite(n) ? n.toFixed(2) : ''`.
- `fmtInvoiceDate(iso, tz)`: `new Intl.DateTimeFormat('en-CA', { timeZone: tz, year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date(iso))` → `YYYY-MM-DD` (en-CA gives ISO-style).
- `ACCOUNTING_HEADERS = ['Invoice #','Date','Customer','Email','Description','Subtotal (AED)','VAT %','VAT (AED)','Total (AED)','TRN']`.
- `toAccountingRow(inv, tz)`: returns cells in header order; `customer_name_snapshot`/`email`/`description`/`trn` → `?? ''`; `vat_rate` via `fmtMoney`? No — VAT % is `Number(inv.vat_rate).toFixed(2)` too (e.g. `5.00`). money fields via `fmtMoney`.
- `buildAccountingExport(invoices, tz)`: `{ headers: ACCOUNTING_HEADERS, rows: invoices.map(i=>toAccountingRow(i,tz)), totals: { count, subtotal: Σ Number(subtotal_aed), vat: Σ Number(vat_aed), total: Σ Number(total_aed) } }`.

**Tests (write first, must fail, then pass):**
- `fmtMoney`: `fmtMoney(1234.5) === '1234.50'`; `fmtMoney('99.005')` rounds to `'99.01'`/`'99.00'` (assert via `Number`); `fmtMoney('abc') === ''`; `fmtMoney(null as any) === ''`.
- `fmtInvoiceDate`: `fmtInvoiceDate('2026-03-19T22:30:00Z','Asia/Dubai') === '2026-03-20'` (UTC 22:30 → Dubai +4 → next day) — proves gym-tz, not UTC.
- `toAccountingRow`: returns 10 cells, correct order; nulls → `''`.
- `buildAccountingExport`: totals sum correctly across 2+ invoices; `count` matches; empty array → zero totals + `[]` rows.

Run `npx vitest run src/lib/accounting-export.test.ts`. Commit.

---

### Task 2: Manager-tier report page
**Files:** Create `src/app/dashboard/reports/accounting/page.tsx`. (Add a nav/report-index link only if the other report pages are linked from a reports index — match whatever pattern attendance/payroll use; if they're standalone, skip nav.)

- `'use ...'`: server component (no client directive).
- Guard: `const { supabase, profile, box, boxName } = await requireManagerPage()` (`@/lib/auth/page-guards`).
- `searchParams: Promise<{ range?: string }>`; validate: `const days = [30,90,365].includes(Number(sp.range)) ? Number(sp.range) : 90`.
- `const rangeStartIso = new Date(Date.now() - days*86400000).toISOString()`.
- Query:
  ```ts
  const { data: invoices } = await supabase
    .from('invoices')
    .select('invoice_number, issued_at, customer_name_snapshot, customer_email_snapshot, description, subtotal_aed, vat_rate, vat_aed, total_aed, trn_snapshot')
    .eq('box_id', profile.box_id)
    .gte('issued_at', rangeStartIso)
    .order('issued_at', { ascending: false })
  ```
- `const tz = box.timezone ?? 'Asia/Dubai'` (use the box timezone field — confirm its name from `GuardedBox`; fall back to `'Asia/Dubai'`).
- `const { headers, rows, totals } = buildAccountingExport(invoices ?? [], tz)`.
- Layout (mirror attendance): `DashboardShell`/heading "Accounting export"; a range selector (links `?range=30|90|365`, active state) like attendance's day selector; a summary line ("N invoices · Subtotal AED … · VAT AED … · Total AED …" using `totals`); `<DownloadCsvButton filename={\`invoices-${days}d.csv\`} headers={headers} rows={rows} />`; a preview table of the first ~100 rows (note "showing first 100; CSV has all N" if more). Use the SAME table/heading styling as attendance/payroll — do not invent new components.
- Empty state: if no invoices in range, show a friendly "No invoices issued in this period." (still render the range selector).

Run `npm run type-check` + `npm run lint`. Commit.

---

## Verification
- `npx vitest run src/lib/accounting-export.test.ts` green.
- `npm run lint && npm run type-check && npm run test` green; `npm run build` green.
- Manual: load `/dashboard/reports/accounting` against dev, switch ranges, download the CSV, confirm it opens in a spreadsheet with the VAT split + correct gym-tz dates.
- Isolation (judge step): the query is box-scoped by RLS + explicit filter; no service client.
