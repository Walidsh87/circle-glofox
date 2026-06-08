# AI Workout Parser — Design

**Date:** 2026-06-08
**Feature:** A "Parse with AI" step on the batch-import page that turns a coach's freeform programming text into the structured block format the existing importer understands, so they can review and import it.
**Roadmap:** v2 Tier 2 #16 (AI workout parser). The smart front-end to the #11 batch-import pipeline.

---

## Problem

The batch importer (#11) needs a rigid block format (date line, title, workout lines, blocks split by blank lines). Coaches keep programming as freeform prose ("Mon: Fran. Tue: 5×5 back squat @80%, then Cindy…"). Hand-converting it to the strict format is the friction this removes.

## Why this is small and safe

The deterministic import pipeline already exists and is tested: `parseBatch` (text → validated `ParsedDay[]`) + `previewImport`/`commitImport` (NEW/REPLACE/BLOCKED/INVALID classification + score-guard). The AI only needs to produce the **block-format text**; everything downstream is unchanged. The AI **never writes data** — its output flows through `parseBatch` + the preview, so a hallucinated date or malformed line surfaces as an `INVALID` row before any commit. AI proposes; the proven pipeline disposes.

## Scope decisions (locked during brainstorming)

1. **AI fills the existing import textarea, then the existing review.** Not a separate auto-import path. The coach edits the AI output, then runs the same Preview → Import.
2. **Server-side Claude call** (`@anthropic-ai/sdk`), model `claude-sonnet-4-6`. Key never reaches the browser.
3. **`ANTHROPIC_API_KEY` is optional** — the app boots without it; the panel reports "not configured."

## Approach (chosen: A)

A staff-gated `aiParseProgramming(freeform)` action calls Claude with a prompt that teaches the exact block format and returns the structured text. A "✨ Parse with AI" panel on the import page drops the result into the existing textarea (`setText`). Pure helpers build the prompt and clean the response; the SDK is mocked in tests.

Rejected: **B** structured JSON / tool-use with its own preview path (bypasses the editable text + needs a parallel commit path — more surface, less reuse; the option the user declined); **C** a browser-side Anthropic call (exposes the API key — must be server-side).

---

## 1. Pure helpers — `src/app/dashboard/programming/_lib/ai-prompt.ts`

```ts
export type ParsePrompt = { system: string; user: string }

// Teaches the exact block format parseBatch understands. Pure (no I/O).
export function buildParsePrompt(freeform: string): ParsePrompt
```
The `system` string specifies, verbatim, the output contract:
- One **block per training day**, blocks separated by a single blank line.
- **Line 1:** `YYYY-MM-DD` then an optional scoring word — one of `For Time`, `AMRAP`, `Rounds + Reps`, `Load` (default `For Time` if unclear).
- **Line 2:** a short WOD title.
- **Lines 3+:** the workout (movements, reps, loads), one idea per line.
- Output **only** the blocks — no commentary, no code fences, no extra prose.
- If a date is ambiguous/relative ("Monday"), resolve against the current week starting from today's date (which the prompt includes).
- A worked example (freeform → blocks) for one-shot grounding.

The `user` string is the coach's freeform text.

```ts
// Strips markdown code fences, leading/trailing prose, and surrounding whitespace.
export function extractBlockText(raw: string): string
```
Handles: a fenced ```…``` block (return the inner text), a leading line like "Here's the structured programming:" (drop non-block preamble), and plain output (return trimmed). Pure, unit-tested.

## 2. Action — `src/app/dashboard/programming/_actions/ai-parse-programming.ts`

```ts
export async function aiParseProgramming(freeform: string): Promise<{ error: string | null; text: string | null }>
```
- **Input guards:** `freeform.trim()` non-empty (else `'Paste some programming to parse.'`); length ≤ **8000** chars (else `'That's too long to parse at once — try a week or two.'`).
- **Staff gate:** RLS client (`@/lib/supabase/server`) → `auth.getUser` → profile role in `('owner','coach')` (else `'Only owners and coaches can use the AI parser.'`).
- **Config check:** if `env.ANTHROPIC_API_KEY` is undefined → `{ error: "AI parsing isn't configured yet.", text: null }`.
- **Call Claude:** `new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })`, `messages.create({ model: 'claude-sonnet-4-6', max_tokens: 4096, temperature: 0.2, system, messages: [{ role: 'user', content: user }] })` from `buildParsePrompt(freeform)`. Wrap in try/catch → on failure `{ error: 'The AI parser is unavailable right now. Try again.', text: null }` (log the real error server-side).
- Concatenate the text content blocks, run `extractBlockText`; if empty → `{ error: "The AI couldn't structure that — try rephrasing.", text: null }`.
- Return `{ error: null, text }`.

Returns `string | null` fields (no throw) so the UI surfaces errors inline.

## 3. UI — `src/app/dashboard/programming/_components/ai-parse-panel.tsx` (client)

A collapsible "✨ Parse with AI" panel rendered above the main textarea in `import-form.tsx`:
- A freeform `<textarea>` (placeholder: "Paste a coach's week, however it's written…") + a **Parse** button (`useTransition`).
- On success, calls `onParsed(text)` (the parent's `setText`) to fill the main import textarea, clears its own field, and shows a one-line "Structured below — review and edit before importing." Errors surface inline.
- Wired into `import-form.tsx` by adding `<AiParsePanel onParsed={setText} />` above the existing format hint + textarea. (`import-form.tsx` already exposes `const [text, setText] = useState('')`.)

The panel is always rendered; if the key is unconfigured the action returns the "not configured" message inline (no separate gating UI needed).

## 4. Env + dependencies

- `npm install @anthropic-ai/sdk`.
- `src/env.ts`: add `ANTHROPIC_API_KEY: z.string().min(1).optional()` to the schema and the `parse({...})` object. **Optional** so the app boots without it.
- `.env.example`: add `ANTHROPIC_API_KEY=` with a comment ("optional — enables the AI workout parser").
- Model: `claude-sonnet-4-6` (capable + cost-effective for format conversion).

## 5. Cost & safety

- **Server-side only** — the key is read from `env` in the action; it never reaches the client.
- **Staff-gated** (owner/coach) + **8000-char input cap** bound cost and abuse.
- **Low temperature (0.2)** for stable formatting.
- **Zero AI write access:** output only fills a textarea; `parseBatch` + the preview validate it. Hallucinated dates/format → `INVALID` rows the coach sees before commit.
- `/dashboard/programming/import` is already staff-authed — no new public surface, nothing to rate-limit beyond the existing dashboard auth.

## 6. Testing

- **Pure `buildParsePrompt`** (`ai-prompt.test.ts`): the system string contains the format contract (date-line rule, the four scoring words, "blocks separated by a blank line", "no code fences"); the user string contains the freeform input.
- **Pure `extractBlockText`**: strips a ```fenced``` block to its inner text; drops a leading prose line; passes clean block text through unchanged; trims whitespace.
- **Action integration** (`ai-parse-programming.integration.test.ts`, **mocking `@anthropic-ai/sdk`**): non-staff rejected; empty input rejected; >8000 chars rejected; missing key → graceful "not configured"; success path (mocked `messages.create` returns block text → action returns the extracted text); SDK throw → typed `'unavailable'` error, not a throw. (Mock `env` to inject/omit `ANTHROPIC_API_KEY`.)

## 7. Out of scope (YAGNI)

Structured JSON / tool-use output · streaming · auto-import without review · image/PDF parsing · multi-language prompts · response caching · usage quotas/metering · in-app model picker.

## File summary

| File | Type | Responsibility |
|---|---|---|
| `src/app/dashboard/programming/_lib/ai-prompt.ts` | create, pure | `buildParsePrompt`, `extractBlockText` |
| `src/app/dashboard/programming/_actions/ai-parse-programming.ts` | create, DB+SDK | staff-gated Claude call → block text |
| `src/app/dashboard/programming/_components/ai-parse-panel.tsx` | create, client | "Parse with AI" panel |
| `src/app/dashboard/programming/_components/import-form.tsx` | modify (+panel) | render `<AiParsePanel onParsed={setText} />` |
| `src/env.ts` | modify | optional `ANTHROPIC_API_KEY` |
| `.env.example` | modify | document the key |
| `package.json` | modify | `@anthropic-ai/sdk` dep |
| `src/__tests__/ai-prompt.test.ts` | create | pure helper tests |
| `src/__tests__/ai-parse-programming.integration.test.ts` | create | action tests (SDK mocked) |
