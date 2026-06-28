# E2E tests (Playwright)

End-to-end tests that drive the real app against a **local Supabase stack** — the
critical paths that unit/integration tests (which mock Supabase) can't cover.

## Run

```bash
npm run e2e:db      # once: boots the local Supabase stack (Docker) + applies schema → .env.test
npm run test:e2e    # runs the suite (auto-starts `next dev` on :3001 against the local stack)
```

Requires Docker running. `npm run e2e:db` is idempotent — re-run it any time (e.g. after a reboot).

## How it works

- **Database:** a local Supabase stack (`supabase start`), seeded from `schema.sql` +
  the repo migrations (`scripts/e2e-apply-schema.mjs`). Self-contained, free, resets cleanly —
  no remote project to drift/rot. `.env.test` (gitignored) holds its URL + the public demo keys.
- **Auth (magic-link, no passwords):** `e2e/global.setup.ts` seeds the gym, then logs each role
  in via the Supabase admin `generateLink` → the real `/auth/confirm` route, saving a
  `storageState` per role under `e2e/.auth/` (gitignored). No inbox needed.
- **Seed:** `e2e/setup/fixtures.ts` — an idempotent `e2e-suite` gym + athlete/owner/coach,
  athlete agreements (waiver/terms/PAR-Q) + a paid membership, and a fresh bookable class today.

## Specs

- `smoke.spec.ts` — app boots + serves a page.
- `booking.spec.ts` — athlete books today's class → staff checks them in (the core no-Stripe path).

## CI

Not wired into CI yet (local-first). The `next dev` webServer + the Supabase stack would need
a CI job (Docker + `supabase start`) before adding `test:e2e` to the pipeline.
