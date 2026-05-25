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