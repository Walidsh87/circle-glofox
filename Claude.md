1. Think Before Coding
Don't assume. Don't hide confusion. Surface tradeoffs.

Before implementing:

State your assumptions explicitly. If uncertain, ask.
If multiple interpretations exist, present them - don't pick silently.
If a simpler approach exists, say so. Push back when warranted.
If something is unclear, stop. Name what's confusing. Ask.
2. Simplicity First
Minimum code that solves the problem. Nothing speculative.

No features beyond what was asked.
No abstractions for single-use code.
No "flexibility" or "configurability" that wasn't requested.
No error handling for impossible scenarios.
If you write 200 lines and it could be 50, rewrite it.
Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

3. Surgical Changes
Touch only what you must. Clean up only your own mess.

When editing existing code:

Don't "improve" adjacent code, comments, or formatting.
Don't refactor things that aren't broken.
Match existing style, even if you'd do it differently.
If you notice unrelated dead code, mention it - don't delete it.
When your changes create orphans:

Remove imports/variables/functions that YOUR changes made unused.
Don't remove pre-existing dead code unless asked.
The test: Every changed line should trace directly to the user's request.

4. Goal-Driven Execution
Define success criteria. Loop until verified.

Transform tasks into verifiable goals:

"Add validation" → "Write tests for invalid inputs, then make them pass"
"Fix the bug" → "Write a test that reproduces it, then make it pass"
"Refactor X" → "Ensure tests pass before and after"

- For multi-step tasks, state a brief plan:

1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]

---

5. CI/CD & Quality Enforcement

Every project should have these four layers in place:

## a) GitHub Actions CI (.github/workflows/ci.yml)
Runs on push and PR to main. Three gates in order:
1. `npm run lint` — ESLint (next lint)
2. `npm run type-check` — TypeScript compiler check (tsc --noEmit)
3. `npm run test` — Vitest unit tests

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run type-check
      - run: npm run test
```

## b) Husky + lint-staged (pre-commit hook)
Blocks commits that have ESLint errors.

Install: `npm install --save-dev husky lint-staged`
Init: `npx husky init`

.husky/pre-commit:
```sh
npx lint-staged
```

package.json lint-staged config:
```json
"lint-staged": {
  "**/*.{ts,tsx}": ["eslint --fix --max-warnings=0"]
}
```

## c) Type-check script
Add to package.json scripts:
```json
"type-check": "tsc --noEmit"
```

## d) Vitest coverage thresholds
Install: `npm install --save-dev @vitest/coverage-v8`

Add to package.json scripts:
```json
"test:coverage": "vitest run --coverage"
```

Add to vitest.config.ts:
```ts
coverage: {
  provider: 'v8',
  reporter: ['text', 'json', 'html'],
  include: ['src/**/*.ts', 'src/**/*.tsx'],
  exclude: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'src/app/**/page.tsx', 'src/app/**/layout.tsx'],
  thresholds: { lines: 70, functions: 70, branches: 60, statements: 70 },
}
```

## Verification checklist for a new project
- [ ] `npm run type-check` passes with 0 errors
- [ ] `npm run test` all tests green
- [ ] `npm run test:coverage` thresholds pass
- [ ] Introduce a lint error → commit blocked by Husky
- [ ] Push to GitHub → Actions tab shows green CI run

---

6. Security & Production Hardening

Every project should have these layers before real users touch it:

## a) Security headers (next.config.mjs)
Add via `headers()` — prevents clickjacking, MIME sniffing, and info leakage:
```js
async headers() {
  return [{
    source: '/(.*)',
    headers: [
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    ],
  }]
},
```

## b) Environment variable validation (src/env.ts)
Install: `npm install zod`

Create `src/env.ts` — validates all required env vars at startup, fails loud if any are missing:
```ts
import { z } from 'zod'

const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  // add all required vars here
})

export const env = schema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
})
```

Also create `.env.example` with all keys listed (no values) — required for any new deployment or dev setup.

## c) Zod validation for server actions
Use Zod schemas in `_lib/validation.ts` files. Keep `string | null` return type so existing tests stay green:
```ts
import { z } from 'zod'

const schema = z.object({
  fieldA: z.string().min(1),
  fieldB: z.number().positive(),
})

export function validateInput(fieldA: string, fieldB: number): string | null {
  const result = schema.safeParse({ fieldA, fieldB })
  if (!result.success) return 'Human-readable error message.'
  return null
}
```
Coverage note: scope `include` in vitest.config.ts to `src/**/_lib/*.ts` — these are the pure logic files with unit tests.

## d) Rate limiting on auth routes
For production (serverless-safe): `@upstash/ratelimit` + Upstash Redis.
For simple/dev: in-memory counter in middleware.ts (resets per cold start — not suitable for production).
Apply in `middleware.ts` before the Supabase auth check.

## e) Route-level error boundaries
Add `error.tsx` per major App Router segment so one crash doesn't blank the whole app:
```tsx
// src/app/dashboard/error.tsx
'use client'
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div>
      <p>{error.message}</p>
      <button onClick={reset}>Try again</button>
    </div>
  )
}
```
Add for: `/dashboard`, `/[gymSlug]`, `/onboarding`.

## f) Database migration strategy
Keep SQL files in `/migrations/` with sequential naming — never scatter raw SQL in root:
```
migrations/
  001_schema.sql
  002_seed-demo.sql
  003_add-leads-rls.sql
  ...
```
Add `migrations/README.md` explaining how to run them (e.g. Supabase SQL Editor steps).

## g) GitHub automation
`.github/dependabot.yml` — weekly dependency update PRs:
```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
```

`.github/pull_request_template.md` — standard checklist on every PR.

Branch protection rules (GitHub UI, not a file): require CI to pass before merge to main.

## h) Staging environment
Before onboarding real gyms:
- Create a second Supabase project for staging (free tier)
- Add staging env vars to Vercel preview deployments
- Create `.env.staging.example` listing which vars differ from production

## Verification checklist for production readiness
- [ ] `curl -I https://your-domain.com` shows X-Frame-Options, X-Content-Type-Options headers
- [ ] Remove a required env var → startup throws with clear Zod error
- [ ] Pass invalid input to a server action → returns typed error (not 500)
- [ ] Throw in a dashboard component → route error.tsx shown, not blank screen
- [ ] `ls migrations/` shows numbered files with README