# AI Workout Parser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "Parse with AI" step on `/dashboard/programming/import` that converts a coach's freeform programming into the block format the existing importer understands, fills the import textarea, and lets the coach review → Preview → Import.

**Architecture:** A staff-gated `aiParseProgramming(freeform)` action calls Claude (`@anthropic-ai/sdk`, `claude-sonnet-4-6`) with a prompt built by a pure helper, cleans the response with a pure helper, and returns block text. The AI has **zero write access** — its output flows through the existing `parseBatch` + preview/commit, which validate it.

**Tech Stack:** Next.js 16 server actions, Anthropic SDK, TypeScript strict, Vitest. Reference spec: `docs/superpowers/specs/2026-06-08-ai-workout-parser-design.md`.

**Conventions reused (read once):**
- Block format the AI must emit: `src/app/dashboard/programming/_lib/parse-batch.ts` (date line `YYYY-MM-DD [scoring]`, title, workout lines, blocks split by blank line; scoring words For Time / AMRAP / Rounds + Reps / Load).
- Import UI: `src/app/dashboard/programming/_components/import-form.tsx` (exposes `const [text, setText] = useState('')`; the panel mounts above the `<textarea>`).
- Staff-gate pattern: `src/app/dashboard/programming/_actions/clear-day.ts`. Env: `src/env.ts` (zod schema). Tests FLAT in `src/__tests__/`; harness: `src/__tests__/log-score.integration.test.ts`.

**Run:** `npm test` · `npm test -- <name>` · `npm run type-check` · `npm run lint` · `npm run build`. Husky `eslint --fix --max-warnings=0` — zero warnings.

---

## File Structure

| File | Type | Responsibility |
|---|---|---|
| `package.json` | modify | `@anthropic-ai/sdk` dep |
| `src/env.ts` | modify | optional `ANTHROPIC_API_KEY` |
| `.env.example` | modify | document the key |
| `src/app/dashboard/programming/_lib/ai-prompt.ts` | create, pure | `buildParsePrompt`, `extractBlockText` |
| `src/__tests__/ai-prompt.test.ts` | create | pure helper tests |
| `src/app/dashboard/programming/_actions/ai-parse-programming.ts` | create, DB+SDK | staff-gated Claude call |
| `src/__tests__/ai-parse-programming.integration.test.ts` | create | action tests (SDK mocked) |
| `src/app/dashboard/programming/_components/ai-parse-panel.tsx` | create, client | "Parse with AI" panel |
| `src/app/dashboard/programming/_components/import-form.tsx` | modify (+panel) | render the panel |

---

## Task 1: Dependency + env

**Files:** `package.json` (via npm), `src/env.ts`, `.env.example`.

- [ ] **Step 1: Install the SDK**

```bash
cd "/Users/walid/Desktop/My WorkSpace/Circle Glofox"
npm install @anthropic-ai/sdk
```

- [ ] **Step 2: Add the optional env var**

In `src/env.ts`, add to the zod `schema` object (after `PORTAL_SIGN_SECRET`):
```ts
  // Optional: enables the AI workout parser (#16). Absent → feature reports "not configured".
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
```
And add to the `schema.parse({...})` object:
```ts
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
```

- [ ] **Step 3: Document it in `.env.example`**

Append to `.env.example`:
```
# AI workout parser (#16) — optional; enables "Parse with AI" on the programming import page.
ANTHROPIC_API_KEY=
```

- [ ] **Step 4: Verify and commit**

Run: `npm run type-check` → 0 errors. `npm run build` → succeeds (env still parses; the new var is optional).

```bash
git add package.json package-lock.json src/env.ts .env.example
git commit -m "$(cat <<'EOF'
feat(ai): add @anthropic-ai/sdk + optional ANTHROPIC_API_KEY

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Pure prompt + extraction helpers

**Files:** Create `src/app/dashboard/programming/_lib/ai-prompt.ts`; Test `src/__tests__/ai-prompt.test.ts`.

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/ai-prompt.test.ts`:

```ts
import { buildParsePrompt, extractBlockText } from '@/app/dashboard/programming/_lib/ai-prompt'

describe('buildParsePrompt', () => {
  test('system teaches the block format + scoring words; user carries the freeform', () => {
    const { system, user } = buildParsePrompt('Mon Fran 21-15-9', '2026-07-01')
    expect(system).toMatch(/YYYY-MM-DD/)
    expect(system).toContain('For Time')
    expect(system).toContain('AMRAP')
    expect(system).toContain('Rounds + Reps')
    expect(system).toContain('Load')
    expect(system).toMatch(/blank line/i)
    expect(system).toMatch(/code fence/i)
    expect(system).toContain('2026-07-01') // today injected for relative-day resolution
    expect(user).toBe('Mon Fran 21-15-9')
  })
})

describe('extractBlockText', () => {
  test('strips a surrounding markdown code fence', () => {
    expect(extractBlockText('```\n2026-07-01 For Time\nFran\n21-15-9\n```')).toBe('2026-07-01 For Time\nFran\n21-15-9')
  })
  test('strips a language-tagged fence', () => {
    expect(extractBlockText('```text\nFran\n```')).toBe('Fran')
  })
  test('passes plain block text through, trimmed', () => {
    expect(extractBlockText('  2026-07-01 For Time\nFran  ')).toBe('2026-07-01 For Time\nFran')
  })
  test('empty stays empty', () => {
    expect(extractBlockText('')).toBe('')
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- ai-prompt`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement**

Create `src/app/dashboard/programming/_lib/ai-prompt.ts`:

```ts
export type ParsePrompt = { system: string; user: string }

// Builds the Claude prompt that converts freeform programming into the strict
// block format `parseBatch` understands. Pure: `today` is injected (defaults to
// the real date) so the model can resolve relative days, and so it's testable.
export function buildParsePrompt(freeform: string, today: string = new Date().toISOString().slice(0, 10)): ParsePrompt {
  const system = `You convert a coach's freeform CrossFit programming into a strict block format for an importer.

Today's date is ${today}. Resolve relative days (e.g. "Monday", "tomorrow") against the current week starting from today.

OUTPUT CONTRACT — output ONLY day blocks, nothing else:
- One block per training day. Separate blocks with a single blank line.
- Line 1: an ISO date in YYYY-MM-DD format, then an optional scoring word — one of: For Time, AMRAP, Rounds + Reps, Load. Default to "For Time" if the scoring is unclear.
- Line 2: a short WOD title.
- Lines 3 and beyond: the workout (movements, reps, loads), one idea per line.
- Do NOT wrap the output in code fences. Do NOT add any commentary, explanations, or headings.

EXAMPLE
Input: "Mon Fran 21-15-9 thrusters/pullups. Tue 20min amrap cindy 5 pullups 10 pushups 15 squats"
Output:
2026-07-01 For Time
Fran
21-15-9
Thrusters
Pull-ups

2026-07-02 AMRAP
Cindy
20 min AMRAP:
5 pull-ups
10 push-ups
15 squats`
  return { system, user: freeform }
}

// Cleans the model output: strips a surrounding markdown code fence and trims.
// (Stray non-block prose, if any, is caught downstream as an INVALID row.)
export function extractBlockText(raw: string): string {
  const s = (raw ?? '').trim()
  const fence = s.match(/^```[a-z]*\n([\s\S]*?)\n```$/i)
  return (fence ? fence[1] : s).trim()
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npm test -- ai-prompt`
Expected: PASS — all green.

- [ ] **Step 5: Type-check and commit**

Run: `npm run type-check` → 0 errors.

```bash
git add src/app/dashboard/programming/_lib/ai-prompt.ts src/__tests__/ai-prompt.test.ts
git commit -m "$(cat <<'EOF'
feat(ai): pure buildParsePrompt + extractBlockText for the workout parser

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `aiParseProgramming` action

**Files:** Create `src/app/dashboard/programming/_actions/ai-parse-programming.ts`; Test `src/__tests__/ai-parse-programming.integration.test.ts`.

- [ ] **Step 1: Write the failing integration tests**

Create `src/__tests__/ai-parse-programming.integration.test.ts`:

```ts
import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate, createMock, envHolder } = vi.hoisted(() => ({
  serverCreate: vi.fn(),
  createMock: vi.fn(),
  envHolder: { ANTHROPIC_API_KEY: 'sk-test' as string | undefined },
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('@/env', () => ({ env: envHolder }))
vi.mock('@anthropic-ai/sdk', () => ({ default: class { messages = { create: createMock } } }))

import { aiParseProgramming } from '@/app/dashboard/programming/_actions/ai-parse-programming'

const staff = () => makeSupabaseMock({ user: { id: 'c1' }, results: { profiles: { data: { role: 'coach' }, error: null } } })

beforeEach(() => {
  vi.clearAllMocks()
  envHolder.ANTHROPIC_API_KEY = 'sk-test'
})

test('rejects empty input before auth', async () => {
  const res = await aiParseProgramming('   ')
  expect(res.error).toMatch(/paste/i)
  expect(serverCreate).not.toHaveBeenCalled()
})

test('rejects input over the length cap', async () => {
  const res = await aiParseProgramming('x'.repeat(8001))
  expect(res.error).toMatch(/too long/i)
})

test('rejects a non-staff athlete (no AI call)', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'a1' }, results: { profiles: { data: { role: 'athlete' }, error: null } } }))
  const res = await aiParseProgramming('Mon Fran')
  expect(res.error).toMatch(/owners and coaches/i)
  expect(createMock).not.toHaveBeenCalled()
})

test('reports when the API key is not configured (no AI call)', async () => {
  envHolder.ANTHROPIC_API_KEY = undefined
  serverCreate.mockResolvedValue(staff())
  const res = await aiParseProgramming('Mon Fran')
  expect(res.error).toMatch(/not configured/i)
  expect(createMock).not.toHaveBeenCalled()
})

test('returns the extracted block text on success', async () => {
  serverCreate.mockResolvedValue(staff())
  createMock.mockResolvedValue({ content: [{ type: 'text', text: '```\n2026-07-01 For Time\nFran\n21-15-9\n```' }] })
  const res = await aiParseProgramming('Mon Fran 21-15-9')
  expect(res.error).toBeNull()
  expect(res.text).toBe('2026-07-01 For Time\nFran\n21-15-9')
})

test('surfaces an SDK failure as a typed error, not a throw', async () => {
  serverCreate.mockResolvedValue(staff())
  createMock.mockRejectedValue(new Error('network'))
  const res = await aiParseProgramming('Mon Fran')
  expect(res.error).toMatch(/unavailable/i)
  expect(res.text).toBeNull()
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- ai-parse-programming`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement the action**

Create `src/app/dashboard/programming/_actions/ai-parse-programming.ts`:

```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'
import { env } from '@/env'
import { buildParsePrompt, extractBlockText } from '../_lib/ai-prompt'

const MAX_INPUT = 8000

export async function aiParseProgramming(freeform: string): Promise<{ error: string | null; text: string | null }> {
  const input = (freeform ?? '').trim()
  if (!input) return { error: 'Paste some programming to parse.', text: null }
  if (input.length > MAX_INPUT) return { error: "That's too long to parse at once — try a week or two.", text: null }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.', text: null }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['owner', 'coach'].includes(profile.role)) {
    return { error: 'Only owners and coaches can use the AI parser.', text: null }
  }

  if (!env.ANTHROPIC_API_KEY) return { error: "AI parsing isn't configured yet.", text: null }

  const { system, user: userMsg } = buildParsePrompt(input)
  try {
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      temperature: 0.2,
      system,
      messages: [{ role: 'user', content: userMsg }],
    })
    const raw = msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('\n')
    const text = extractBlockText(raw)
    if (!text) return { error: "The AI couldn't structure that — try rephrasing.", text: null }
    return { error: null, text }
  } catch (e) {
    console.error('[ai-parse] Anthropic call failed:', e)
    return { error: 'The AI parser is unavailable right now. Try again.', text: null }
  }
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npm test -- ai-parse-programming`
Expected: PASS — 6 tests green.

- [ ] **Step 5: Type-check and commit**

Run: `npm run type-check` → 0 errors.

```bash
git add src/app/dashboard/programming/_actions/ai-parse-programming.ts src/__tests__/ai-parse-programming.integration.test.ts
git commit -m "$(cat <<'EOF'
feat(ai): aiParseProgramming — staff-gated Claude call → block text

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: "Parse with AI" panel + wiring

**Files:** Create `src/app/dashboard/programming/_components/ai-parse-panel.tsx`; Modify `src/app/dashboard/programming/_components/import-form.tsx`. No new tests (UI; verified by type-check + lint + build).

- [ ] **Step 1: Create the panel**

Create `src/app/dashboard/programming/_components/ai-parse-panel.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { aiParseProgramming } from '../_actions/ai-parse-programming'

export function AiParsePanel({ onParsed }: { onParsed: (text: string) => void }) {
  const [open, setOpen] = useState(false)
  const [freeform, setFreeform] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function onParse() {
    setErr(null)
    start(async () => {
      const res = await aiParseProgramming(freeform)
      if (res.error || !res.text) { setErr(res.error ?? 'No output.'); return }
      onParsed(res.text)
      setFreeform('')
      setOpen(false)
    })
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} style={{ marginBottom: 12, height: 32, padding: '0 14px', borderRadius: 8, border: '1px dashed var(--c-border-strong)', background: 'var(--c-surface-alt)', fontSize: 12.5, fontWeight: 600, color: 'var(--c-ink-2)', cursor: 'pointer', fontFamily: 'inherit' }}>
        ✨ Parse with AI
      </button>
    )
  }

  return (
    <div style={{ marginBottom: 14, padding: '14px 16px', borderRadius: 12, background: 'var(--c-surface-alt)', border: '1px solid var(--c-border)' }}>
      <p style={{ fontSize: 12.5, color: 'var(--c-ink-muted)', marginBottom: 8, lineHeight: 1.5 }}>
        Paste a coach&apos;s week however it&apos;s written — AI structures it into the format below. Review and edit before importing.
      </p>
      <textarea
        value={freeform}
        onChange={(e) => setFreeform(e.target.value)}
        placeholder="Mon: Fran 21-15-9 thrusters/pullups. Tue: 20min AMRAP Cindy…"
        spellCheck={false}
        style={{ width: '100%', minHeight: 120, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--c-border-strong)', background: 'var(--c-surface)', color: 'var(--c-ink)', fontSize: 13, fontFamily: 'inherit', lineHeight: 1.5, resize: 'vertical', boxSizing: 'border-box' }}
      />
      <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
        <button type="button" disabled={pending || !freeform.trim()} onClick={onParse} style={{ height: 32, padding: '0 14px', borderRadius: 8, border: 'none', background: 'var(--circle-lime)', fontSize: 12.5, fontWeight: 700, color: 'var(--circle-ink)', cursor: 'pointer', fontFamily: 'inherit' }}>
          {pending ? 'Parsing…' : '✨ Parse'}
        </button>
        <button type="button" disabled={pending} onClick={() => { setOpen(false); setErr(null) }} style={{ height: 32, padding: '0 12px', borderRadius: 8, border: '1px solid var(--c-border-strong)', background: 'var(--c-surface)', fontSize: 12.5, fontWeight: 600, color: 'var(--c-ink-2)', cursor: 'pointer', fontFamily: 'inherit' }}>
          Cancel
        </button>
        {err && <span style={{ fontSize: 12, color: 'var(--c-danger)' }}>{err}</span>}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Wire it into the import form**

In `src/app/dashboard/programming/_components/import-form.tsx`:

(a) Add the import near the top (after the existing imports):
```tsx
import { AiParsePanel } from './ai-parse-panel'
```

(b) Render the panel immediately BEFORE the main `<textarea>` (it currently follows a hint `<p>`). Insert this line right before the `<textarea` element:
```tsx
      <AiParsePanel onParsed={setText} />
```

- [ ] **Step 3: Type-check, lint, build, full suite**

Run: `npm run type-check` → 0 errors.
Run: `npm run lint` → 0 warnings.
Run: `npm run build` → succeeds.
Run: `npm test` → all green.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/programming/_components/ai-parse-panel.tsx src/app/dashboard/programming/_components/import-form.tsx
git commit -m "$(cat <<'EOF'
feat(ai): "Parse with AI" panel on the programming import page

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Final verification (after all tasks)

- [ ] `npm run type-check` → 0 errors
- [ ] `npm run lint` → 0 warnings
- [ ] `npm test` → all green
- [ ] `npm run build` → succeeds
- [ ] Dispatch a final code reviewer over the whole branch, then use `superpowers:finishing-a-development-branch`.

## Notes

- **No migration.** The only deploy step (user-owned): set `ANTHROPIC_API_KEY` in Vercel (and a local `.env`) to enable the feature; without it the panel reports "not configured" and the rest of the app is unaffected.
- **Zero AI write access:** the parser only fills the import textarea; `parseBatch` + the existing preview/commit validate everything — hallucinated dates/format surface as `INVALID` rows before commit.
- **Cost/safety:** server-side key, staff-gated, 8000-char input cap, low temperature.
