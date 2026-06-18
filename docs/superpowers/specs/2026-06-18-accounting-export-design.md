# Accounting Export (#67) — Design

**Date:** 2026-06-18 · **Roadmap:** v2 #67 (Tier 8) [G-gap] · **Status:** approved-by-allowlist (loop build → PR is the review gate)

## Goal
A manager-tier **accounting export**: download the gym's issued invoices as a CSV that imports cleanly into Zoho Books / Xero / QuickBooks (generic, accountant-friendly columns; amounts as plain decimals, no currency symbol).

## Why this shape
- The VAT-compliant `invoices` table (#2, mig 012) already holds everything an accountant needs: sequential `invoice_number`, `issued_at`, VAT split (`subtotal_aed`/`vat_rate`/`vat_aed`/`total_aed`), `trn_snapshot`, and customer snapshots. Each invoice = one completed, paid charge (there is **no status column**).
- Read-only over an existing, RLS-protected table → **no migration, no new RLS surface.**
- Reuses the established report pattern: `requireManagerPage()`, `toCsv`/`DownloadCsvButton`, the `/dashboard/reports/*` page shape.

## Scope (YAGNI)
- New page `src/app/dashboard/reports/accounting/page.tsx` (**owner-tier** — financial data). NB: the `invoices` RLS policy `staff_read_invoices` grants only `('owner','coach')` and this app's role model gives `admin` **no** financial access (mig 058), so the page uses `requireOwnerPage()` (not manager) — a manager/admin guard would silently return zero rows under RLS.
- Pure `src/lib/accounting-export.ts` — builds headers + string rows + a totals summary from invoice records.
- Preset date ranges via `?range=` (`30` / `90` / `365` days, default `90`) mirroring the attendance report's `?days=` pattern.
- Columns: **Invoice #, Date, Customer, Email, Description, Subtotal (AED), VAT %, VAT (AED), Total (AED), TRN**.
- Money: stored `NUMERIC(10,2)` → emitted as `Number(x).toFixed(2)` (e.g. `1234.56`, no symbol).
- Date: formatted in the **gym timezone** (`box.timezone`) as `YYYY-MM-DD` via `Intl` (matches how other reports localize).
- A small on-page table preview + a summary line (count + Σ subtotal/VAT/total) + the CSV button.

## Data flow
`requireManagerPage()` → `supabase.from('invoices').select(<cols>).eq('box_id', profile.box_id).gte('issued_at', rangeStartIso).order('issued_at', desc)` → `buildAccountingExport(rows, box.timezone)` → table + `DownloadCsvButton`. Box scoping is **both** RLS (existing `invoices` policy `box_id = auth_box_id()`) **and** the explicit `.eq('box_id', profile.box_id)` filter (defense-in-depth).

## Security / tenancy
- **Owner-tier only** — financial data (admins have no financial access; see Scope). Not a public surface; `customer_email_snapshot` is the gym's own customer data, shown only to the owner.
- Every read box-scoped by RLS + explicit filter; `box_id` bound from the session (`profile.box_id`), never from input.
- The `?range=` param is validated against an allow-list before use.
- No new table/policy/migration; uses the RLS-client (never the service client).

## Pure-lib interface (`src/lib/accounting-export.ts`)
```ts
export type InvoiceRecord = {
  invoice_number: string; issued_at: string;
  customer_name_snapshot: string | null; customer_email_snapshot: string | null;
  description: string | null;
  subtotal_aed: number | string; vat_rate: number | string; vat_aed: number | string; total_aed: number | string;
  trn_snapshot: string | null;
}
export const ACCOUNTING_HEADERS: string[]            // the 10 column titles
export function fmtMoney(v: number | string): string // Number(v).toFixed(2); '' on NaN
export function fmtInvoiceDate(iso: string, timeZone: string): string  // YYYY-MM-DD in gym tz
export function toAccountingRow(inv: InvoiceRecord, timeZone: string): (string | number)[]
export function buildAccountingExport(invoices: InvoiceRecord[], timeZone: string): {
  headers: string[]; rows: (string | number)[][];
  totals: { count: number; subtotal: number; vat: number; total: number }
}
```

## Out of scope (deferred — record in DECISIONS MADE)
Custom from/to date range + calendar-period (financial-year) presets · per-software column templates (we ship one generic CSV) · JSON/Zoho-API push · refund / credit-note rows (refunds aren't in `invoices`) · pagination/streaming for very high invoice volumes. NB on the last: the query is deliberately **uncapped** (no silent `.limit()`) — an accounting export must be complete, so silently truncating rows is worse than a large payload; true pagination/streaming is the deferred fix for a high-volume gym (the pilot's volume is modest).

## Testing
- Unit (`accounting-export.test.ts`): `fmtMoney` (number+string input, 2dp, NaN→''), `fmtInvoiceDate` (tz correctness — a late-UTC instant lands on the right Dubai day), `toAccountingRow` (column order + null handling), `buildAccountingExport` (totals sum, row count, empty input).
- Isolation: rests on the **existing** `invoices` RLS (`box_id = auth_box_id()`, mig 012) + the explicit `.eq('box_id', …)`; the CI `rls-isolation` job is the DB-level proof. No new RLS to test.
```
