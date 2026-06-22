# Movement / video library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A per-gym movement→video library with inline YouTube/Vimeo embeds, curated by staff, browsable by members, with a ▶ demo deep-link beside movements on the program view + daily WOD.

**Architecture:** `movement_videos` table (box-scoped, mig 085) keyed by a movement `slug` (the `LIFT_NAMES` value for catalog lifts, a normalized slug for custom). A pure `toEmbedUrl` allow-lists **only** YouTube/Vimeo and returns a canonical embed URL (null otherwise) — the security gate at write **and** render. CSP `frame-src` widens to exactly the two embed hosts. A `/dashboard/movements` page browses + (for staff) curates; inline ▶ links deep-link to it.

**Tech Stack:** Next.js 16 (App Router — `searchParams`/`params` are Promises, `await` them), TypeScript strict, Supabase + RLS, Tailwind/shadcn, Vitest. Reuses `LIFT_NAMES`, `requirePage`/`requireProgrammingAction`, `actionError`, the `/dashboard/skills` layout + sidebar patterns.

## Global Constraints

- **Security crux 1 — embed only allow-listed hosts.** `toEmbedUrl` matches host by **exact hostname equality** against an allow-set (never `includes`/`endsWith` on a substring), rejects non-http(s) protocols (`javascript:`/`data:`), look-alikes (`youtube.com.evil.com`), and bad/missing ids. It gates `validateMovementVideo` (write) and is re-applied at render (unrenderable row skipped). An arbitrary URL can never become an iframe `src`.
- **Security crux 2 — minimal CSP widening.** `next.config.mjs` `frame-src` adds exactly `https://www.youtube-nocookie.com https://player.vimeo.com`. No other directive changes; `frame-ancestors 'none'` untouched. The change flows into both the app CSP and the derived `/embed` CSP.
- **Multi-tenant by RLS.** `movement_videos` box-scoped; every query carries `.eq('box_id', …)` with `box_id` from the session. Library read = all box roles; curate = programming tier. G ⊆ P.
- **No client trust on amounts/ids** — N/A (no money). The `slug`/`url` from staff are validated at the boundary.
- TDD on the pure lib (exhaustive `toEmbedUrl`); DRY, YAGNI, frequent commits; match existing style; verified Tailwind tokens only.
- Migration applied by hand in Supabase; feature inert until applied (the page just shows empty + "no video yet"). CI `rls-isolation` replays it.

---

## File Structure

**Create:**
- `migrations/085_movement_videos.sql` + ROLLBACKS entry.
- `src/lib/movement-video.ts` — `toEmbedUrl`, `validateMovementVideo`, `movementSlug`.
- `src/__tests__/movement-video.test.ts` — pure unit tests.
- `src/__tests__/movement-video-actions.integration.test.ts` — action tests.
- `src/app/dashboard/movements/page.tsx` — server page.
- `src/app/dashboard/movements/_components/movement-library.tsx` — client (browse + staff curate).
- `src/app/dashboard/movements/_actions/video.ts` — `saveMovementVideo`/`deleteMovementVideo`.

**Modify:**
- `next.config.mjs` — `frame-src` widening.
- `src/components/sidebar.tsx` — `play` icon + a "Movements" nav entry (everyone).
- `src/app/dashboard/program/page.tsx` — fetch box video slugs; pass to `ExerciseLogger`.
- `src/app/dashboard/program/_components/exercise-logger.tsx` — optional `videoSlug?` prop → ▶ link.
- `src/app/dashboard/wod/page.tsx` — fetch slugs; ▶ link in the strength card.

**Reuse (don't modify):** `LIFT_NAMES`, `requirePage`, `requireProgrammingAction`, `actionError`, `PROGRAMMING_ROLES`.

---

### Task 1: Migration 085 + pure lib + unit tests

**Files:**
- Create: `migrations/085_movement_videos.sql`; modify `migrations/ROLLBACKS.md`
- Create: `src/lib/movement-video.ts`
- Test: `src/__tests__/movement-video.test.ts`

**Interfaces:**
- Produces: `toEmbedUrl(url): { provider: 'youtube' | 'vimeo'; embedUrl: string } | null`; `validateMovementVideo({slug,label,url}): string | null`; `movementSlug(name): string`.

- [ ] **Step 1: Write the failing tests** — `src/__tests__/movement-video.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { toEmbedUrl, validateMovementVideo, movementSlug } from '@/lib/movement-video'

describe('toEmbedUrl — accepts YouTube', () => {
  const yt = { provider: 'youtube' as const, embedUrl: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ' }
  it('watch?v=', () => expect(toEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toEqual(yt))
  it('watch with extra params', () => expect(toEmbedUrl('https://youtube.com/watch?v=dQw4w9WgXcQ&t=30s')).toEqual(yt))
  it('youtu.be', () => expect(toEmbedUrl('https://youtu.be/dQw4w9WgXcQ')).toEqual(yt))
  it('shorts', () => expect(toEmbedUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toEqual(yt))
  it('embed', () => expect(toEmbedUrl('https://www.youtube.com/embed/dQw4w9WgXcQ')).toEqual(yt))
  it('nocookie embed', () => expect(toEmbedUrl('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')).toEqual(yt))
})

describe('toEmbedUrl — accepts Vimeo', () => {
  const vm = { provider: 'vimeo' as const, embedUrl: 'https://player.vimeo.com/video/123456789' }
  it('vimeo.com/<id>', () => expect(toEmbedUrl('https://vimeo.com/123456789')).toEqual(vm))
  it('player.vimeo.com/video/<id>', () => expect(toEmbedUrl('https://player.vimeo.com/video/123456789')).toEqual(vm))
})

describe('toEmbedUrl — rejects everything else (security)', () => {
  it('arbitrary host', () => expect(toEmbedUrl('https://evil.com/watch?v=dQw4w9WgXcQ')).toBeNull())
  it('host look-alike suffix', () => expect(toEmbedUrl('https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ')).toBeNull())
  it('host in path only', () => expect(toEmbedUrl('https://evil.com/youtube.com/watch?v=dQw4w9WgXcQ')).toBeNull())
  it('javascript: scheme', () => expect(toEmbedUrl('javascript:alert(1)')).toBeNull())
  it('data: scheme', () => expect(toEmbedUrl('data:text/html,<script>alert(1)</script>')).toBeNull())
  it('not a url', () => expect(toEmbedUrl('not a url')).toBeNull())
  it('youtube with bad id', () => expect(toEmbedUrl('https://www.youtube.com/watch?v=tooShort')).toBeNull())
  it('youtube watch with no id', () => expect(toEmbedUrl('https://www.youtube.com/watch')).toBeNull())
  it('vimeo with non-numeric id', () => expect(toEmbedUrl('https://vimeo.com/abcdef')).toBeNull())
  it('empty', () => expect(toEmbedUrl('')).toBeNull())
})

describe('validateMovementVideo', () => {
  const ok = { slug: 'back_squat', label: 'Back Squat', url: 'https://youtu.be/dQw4w9WgXcQ' }
  it('accepts a valid entry', () => expect(validateMovementVideo(ok)).toBeNull())
  it('rejects an empty label', () => expect(validateMovementVideo({ ...ok, label: '  ' })).not.toBeNull())
  it('rejects a non-video url', () => expect(validateMovementVideo({ ...ok, url: 'https://evil.com/x' })).toMatch(/YouTube or Vimeo/))
  it('rejects a bad slug', () => expect(validateMovementVideo({ ...ok, slug: 'Bad Slug!' })).not.toBeNull())
})

describe('movementSlug', () => {
  it('normalizes free text', () => expect(movementSlug('Double Unders!')).toBe('double-unders'))
  it('collapses + trims separators', () => expect(movementSlug('  Wall  ball / shot ')).toBe('wall-ball-shot'))
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/__tests__/movement-video.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/lib/movement-video.ts`**

```ts
// Movement video library (#82): pure helpers. No Supabase (coverage-gated).
// SECURITY: only YouTube/Vimeo may ever become an iframe src — matched by EXACT
// hostname equality (never substring), with a strict id shape. Anything else → null.

const YT_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com'])
const YT_ID = /^[A-Za-z0-9_-]{11}$/
const VIMEO_ID = /^[0-9]+$/

export function toEmbedUrl(raw: string): { provider: 'youtube' | 'vimeo'; embedUrl: string } | null {
  let u: URL
  try { u = new URL(raw.trim()) } catch { return null }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null // reject javascript:/data:
  const host = u.hostname.toLowerCase()

  if (host === 'youtu.be') {
    const id = u.pathname.split('/').filter(Boolean)[0] ?? ''
    return YT_ID.test(id) ? { provider: 'youtube', embedUrl: `https://www.youtube-nocookie.com/embed/${id}` } : null
  }
  if (YT_HOSTS.has(host)) {
    let id = ''
    if (u.pathname === '/watch') id = u.searchParams.get('v') ?? ''
    else if (u.pathname.startsWith('/embed/')) id = u.pathname.slice('/embed/'.length).split('/')[0]
    else if (u.pathname.startsWith('/shorts/')) id = u.pathname.slice('/shorts/'.length).split('/')[0]
    else if (u.pathname.startsWith('/v/')) id = u.pathname.slice('/v/'.length).split('/')[0]
    return YT_ID.test(id) ? { provider: 'youtube', embedUrl: `https://www.youtube-nocookie.com/embed/${id}` } : null
  }
  if (host === 'vimeo.com' || host === 'www.vimeo.com') {
    const id = u.pathname.split('/').filter(Boolean)[0] ?? ''
    return VIMEO_ID.test(id) ? { provider: 'vimeo', embedUrl: `https://player.vimeo.com/video/${id}` } : null
  }
  if (host === 'player.vimeo.com') {
    const parts = u.pathname.split('/').filter(Boolean) // ['video','123']
    const id = parts[0] === 'video' ? (parts[1] ?? '') : ''
    return VIMEO_ID.test(id) ? { provider: 'vimeo', embedUrl: `https://player.vimeo.com/video/${id}` } : null
  }
  return null
}

export function movementSlug(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
}

export function validateMovementVideo(input: { slug: string; label: string; url: string }): string | null {
  if (!input.label || !input.label.trim()) return 'Give the movement a name.'
  if (input.label.trim().length > 80) return 'Name is too long (max 80 characters).'
  if (!/^[a-z0-9-]{1,60}$/.test(input.slug)) return 'Invalid movement.'
  if (!toEmbedUrl(input.url)) return 'Use a YouTube or Vimeo link.'
  return null
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/__tests__/movement-video.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Create `migrations/085_movement_videos.sql`**

```sql
-- migrations/085_movement_videos.sql  (#82 movement / video library)
-- Per-gym movement → demo video (YouTube/Vimeo link). slug = LIFT_NAMES value for
-- catalog lifts, or a normalized slug for custom gym movements. One video per
-- movement per gym. Every member may watch (box-read); programming tier curates.
--
-- Run in the Supabase SQL Editor. Idempotent. Forward-only (RLS).

CREATE TABLE IF NOT EXISTS movement_videos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id      UUID NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  slug        TEXT NOT NULL,
  label       TEXT NOT NULL,
  video_url   TEXT NOT NULL,
  created_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_movement_videos_box_slug ON movement_videos(box_id, slug);

ALTER TABLE movement_videos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS movement_videos_box_read ON movement_videos;
CREATE POLICY movement_videos_box_read ON movement_videos
  FOR SELECT USING (box_id = auth_box_id());

DROP POLICY IF EXISTS movement_videos_programming_manage ON movement_videos;
CREATE POLICY movement_videos_programming_manage ON movement_videos
  FOR ALL
  USING (box_id = auth_box_id() AND auth_is_programming())
  WITH CHECK (box_id = auth_box_id() AND auth_is_programming());
```

Add to `migrations/ROLLBACKS.md` (append a stanza):

```sql
-- 085_movement_videos.sql
DROP TABLE IF EXISTS movement_videos;
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/movement-video.ts src/__tests__/movement-video.test.ts migrations/085_movement_videos.sql migrations/ROLLBACKS.md
git commit -m "feat(movements): movement_videos schema + pure toEmbedUrl/validate lib (#82)"
```

---

### Task 2: Actions + CSP widening

**Files:**
- Create: `src/app/dashboard/movements/_actions/video.ts`
- Modify: `next.config.mjs`
- Test: `src/__tests__/movement-video-actions.integration.test.ts`

**Interfaces:**
- Consumes: `validateMovementVideo` (Task 1), `requireProgrammingAction`, `actionError`.
- Produces: `saveMovementVideo(slug, label, url)`, `deleteMovementVideo(slug)`.

- [ ] **Step 1: Write the failing test** — `src/__tests__/movement-video-actions.integration.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeSupabaseMock } from '@/__tests__/helpers/supabase-mock'

const { requireProg } = vi.hoisted(() => ({ requireProg: vi.fn() }))
vi.mock('@/lib/auth/action-guards', () => ({ requireProgrammingAction: requireProg }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))

async function load() {
  vi.resetModules()
  return import('@/app/dashboard/movements/_actions/video')
}

beforeEach(() => requireProg.mockReset())

describe('saveMovementVideo', () => {
  it('rejects a non-YouTube/Vimeo url before any DB write', async () => {
    const { saveMovementVideo } = await load()
    const res = await saveMovementVideo('back_squat', 'Back Squat', 'https://evil.com/x')
    expect(res.error).toMatch(/YouTube or Vimeo/)
    expect(requireProg).not.toHaveBeenCalled()
  })

  it('upserts box-scoped on a valid entry', async () => {
    const sb = makeSupabaseMock({ results: { movement_videos: { data: null, error: null } } })
    requireProg.mockResolvedValue({ supabase: sb, user: { id: 'u1' }, profile: { box_id: 'b1', role: 'coach', full_name: 'C' } })
    const { saveMovementVideo } = await load()
    const res = await saveMovementVideo('back_squat', 'Back Squat', 'https://youtu.be/dQw4w9WgXcQ')
    expect(res.error).toBeNull()
    expect(sb.builder('movement_videos').upsert).toHaveBeenCalledWith(
      expect.objectContaining({ box_id: 'b1', slug: 'back_squat', label: 'Back Squat', video_url: 'https://youtu.be/dQw4w9WgXcQ' }),
      expect.objectContaining({ onConflict: 'box_id,slug' }),
    )
  })

  it('is denied for a non-programming role', async () => {
    requireProg.mockResolvedValue({ error: 'Only coaches can manage the movement library.' })
    const { saveMovementVideo } = await load()
    const res = await saveMovementVideo('back_squat', 'Back Squat', 'https://youtu.be/dQw4w9WgXcQ')
    expect(res.error).toMatch(/coaches/)
  })
})

describe('deleteMovementVideo', () => {
  it('deletes box + slug scoped', async () => {
    const sb = makeSupabaseMock({ results: { movement_videos: { data: null, error: null } } })
    requireProg.mockResolvedValue({ supabase: sb, user: { id: 'u1' }, profile: { box_id: 'b1', role: 'coach', full_name: 'C' } })
    const { deleteMovementVideo } = await load()
    const res = await deleteMovementVideo('back_squat')
    expect(res.error).toBeNull()
    const del = sb.builder('movement_videos')
    expect(del.delete).toHaveBeenCalled()
    expect(del.eq).toHaveBeenCalledWith('box_id', 'b1')
    expect(del.eq).toHaveBeenCalledWith('slug', 'back_squat')
  })
})
```

> Confirm the `makeSupabaseMock` `.upsert`/`.delete`/`.eq` surface matches existing action tests (e.g. `save-template.integration.test.ts`); mirror their exact mock shape if it differs.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/__tests__/movement-video-actions.integration.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/app/dashboard/movements/_actions/video.ts`**

```ts
'use server'

import { requireProgrammingAction } from '@/lib/auth/action-guards'
import { actionError } from '@/lib/action-error'
import { revalidatePath } from 'next/cache'
import { validateMovementVideo } from '@/lib/movement-video'

export async function saveMovementVideo(slug: string, label: string, url: string): Promise<{ error: string | null }> {
  const err = validateMovementVideo({ slug, label, url })
  if (err) return { error: err }

  const auth = await requireProgrammingAction('Only coaches can manage the movement library.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, user, profile } = auth

  const { error } = await supabase.from('movement_videos').upsert(
    { box_id: profile.box_id, slug, label: label.trim(), video_url: url.trim(), created_by: user.id },
    { onConflict: 'box_id,slug' },
  )
  if (error) return actionError('saveMovementVideo', error)
  revalidatePath('/dashboard/movements')
  return { error: null }
}

export async function deleteMovementVideo(slug: string): Promise<{ error: string | null }> {
  const auth = await requireProgrammingAction('Only coaches can manage the movement library.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, profile } = auth

  const { error } = await supabase.from('movement_videos').delete().eq('box_id', profile.box_id).eq('slug', slug)
  if (error) return actionError('deleteMovementVideo', error)
  revalidatePath('/dashboard/movements')
  return { error: null }
}
```

- [ ] **Step 4: Widen the CSP** — `next.config.mjs`, the `frame-src` line:

```js
  "frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://billing.stripe.com https://checkout.stripe.com https://www.youtube-nocookie.com https://player.vimeo.com",
```

(One line; nothing else changes. `embedCsp` derives from `cspDirectives` so it inherits the new hosts automatically.)

- [ ] **Step 5: Run the test + type-check**

Run: `npx vitest run src/__tests__/movement-video-actions.integration.test.ts && npm run type-check`
Expected: PASS, 0 type errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/movements/_actions/video.ts next.config.mjs src/__tests__/movement-video-actions.integration.test.ts
git commit -m "feat(movements): save/delete actions + CSP frame-src for youtube/vimeo (#82)"
```

---

### Task 3: Library page + staff editor + nav

**Files:**
- Create: `src/app/dashboard/movements/page.tsx`
- Create: `src/app/dashboard/movements/_components/movement-library.tsx`
- Modify: `src/components/sidebar.tsx`

**Interfaces:**
- Consumes: `toEmbedUrl` (render), `saveMovementVideo`/`deleteMovementVideo` (Task 2), `LIFT_NAMES`, `requirePage`, `PROGRAMMING_ROLES`.

> **Test approach:** rendering/curation is UI over the Task-1/2 tested logic; gate = type-check + lint + full suite green + manual. No new unit test (logic is in Tasks 1–2).

- [ ] **Step 1: Create the server page** — `src/app/dashboard/movements/page.tsx`:

```tsx
import { requirePage } from '@/lib/auth/page-guards'
import { PROGRAMMING_ROLES } from '@/lib/auth/roles'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import { LIFT_NAMES } from '@/app/dashboard/lifts/_lib/lift-names'
import { MovementLibrary } from './_components/movement-library'

export default async function MovementsPage() {
  const { supabase, profile, boxName } = await requirePage()
  const canManage = (PROGRAMMING_ROLES as readonly string[]).includes(profile.role)

  const { data: rows } = await supabase
    .from('movement_videos')
    .select('slug, label, video_url')
    .eq('box_id', profile.box_id)
  const videos = (rows ?? []) as { slug: string; label: string; video_url: string }[]

  const catalog = LIFT_NAMES.map((l) => ({ slug: l.value, label: l.label }))
  const catalogSlugs = new Set(catalog.map((c) => c.slug))
  const bySlug = Object.fromEntries(videos.map((v) => [v.slug, v]))
  const custom = videos.filter((v) => !catalogSlugs.has(v.slug)).map((v) => ({ slug: v.slug, label: v.label }))

  return (
    <DashboardShell active="movements" userName={profile.full_name!} userRole={profile.role} boxName={boxName} title="Movement library">
      <MovementLibrary catalog={catalog} custom={custom} videos={bySlug} canManage={canManage} />
    </DashboardShell>
  )
}
```

- [ ] **Step 2: Create the client library component** — `src/app/dashboard/movements/_components/movement-library.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toEmbedUrl, movementSlug } from '@/lib/movement-video'
import { saveMovementVideo, deleteMovementVideo } from '../_actions/video'

type Item = { slug: string; label: string }
type Video = { slug: string; label: string; video_url: string }

const input = 'h-9 w-full rounded-lg border border-line-strong bg-surface px-2.5 text-[12.5px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent'
const btn = 'rounded-lg border border-line bg-surface px-2.5 py-1 text-[11px] font-semibold text-ink-2 transition-colors hover:border-line-strong disabled:opacity-50'
const limeBtn = 'rounded-lg bg-accent px-3 py-1 text-[11.5px] font-semibold text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-50'

function Player({ url }: { url: string }) {
  const embed = toEmbedUrl(url)
  if (!embed) return <p className="text-[12px] text-ink-faint">Invalid video link.</p>
  return (
    <div className="aspect-video w-full overflow-hidden rounded-lg border border-line bg-black">
      <iframe
        src={embed.embedUrl}
        title="Movement demo"
        className="h-full w-full"
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowFullScreen
      />
    </div>
  )
}

function MovementRow({ item, video, canManage }: { item: Item; video: Video | undefined; canManage: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [editing, setEditing] = useState(false)
  const [url, setUrl] = useState(video?.video_url ?? '')

  function save() {
    start(async () => {
      const res = await saveMovementVideo(item.slug, item.label, url)
      if (res.error) { alert(res.error); return }
      setEditing(false); router.refresh()
    })
  }
  function remove() {
    if (!confirm(`Remove the video for ${item.label}?`)) return
    start(async () => {
      const res = await deleteMovementVideo(item.slug)
      if (res.error) { alert(res.error); return }
      router.refresh()
    })
  }

  return (
    <div id={item.slug} className="scroll-mt-20 rounded-[12px] border border-line bg-surface p-3.5">
      <div className="mb-2 flex items-center gap-2">
        <span className="flex-1 text-[13.5px] font-semibold text-ink">{item.label}</span>
        {canManage && !editing && (
          <button type="button" className={btn} onClick={() => { setUrl(video?.video_url ?? ''); setEditing(true) }}>
            {video ? 'Edit' : 'Add video'}
          </button>
        )}
        {canManage && video && !editing && (
          <button type="button" className={btn} disabled={pending} onClick={remove}>Remove</button>
        )}
      </div>
      {editing ? (
        <div className="flex flex-col gap-2">
          <input className={input} placeholder="YouTube or Vimeo link" value={url} onChange={(e) => setUrl(e.target.value)} />
          <div className="flex gap-2">
            <button type="button" className={limeBtn} disabled={pending || !url.trim()} onClick={save}>{pending ? 'Saving…' : 'Save'}</button>
            <button type="button" className={btn} disabled={pending} onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </div>
      ) : video ? (
        <Player url={video.video_url} />
      ) : (
        <p className="text-[12px] text-ink-faint">No video yet.</p>
      )}
    </div>
  )
}

function AddCustom() {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [label, setLabel] = useState('')
  const [url, setUrl] = useState('')
  function add() {
    const slug = movementSlug(label)
    if (!slug) { alert('Give the movement a name.'); return }
    start(async () => {
      const res = await saveMovementVideo(slug, label, url)
      if (res.error) { alert(res.error); return }
      setLabel(''); setUrl(''); router.refresh()
    })
  }
  return (
    <div className="rounded-[12px] border border-dashed border-line-strong bg-surface p-3.5">
      <div className="mb-2 text-[12px] font-semibold text-ink-2">Add a gym movement</div>
      <div className="flex flex-col gap-2">
        <input className={input} placeholder="Movement name (e.g. Double-unders)" value={label} onChange={(e) => setLabel(e.target.value)} />
        <input className={input} placeholder="YouTube or Vimeo link" value={url} onChange={(e) => setUrl(e.target.value)} />
        <button type="button" className={limeBtn + ' self-start'} disabled={pending || !label.trim() || !url.trim()} onClick={add}>{pending ? 'Adding…' : 'Add movement'}</button>
      </div>
    </div>
  )
}

export function MovementLibrary({ catalog, custom, videos, canManage }: { catalog: Item[]; custom: Item[]; videos: Record<string, Video>; canManage: boolean }) {
  // Members see only movements that have a video; staff see the full catalog to curate.
  const catalogShown = canManage ? catalog : catalog.filter((c) => videos[c.slug])
  return (
    <div className="flex max-w-[640px] flex-col gap-6">
      <section>
        <div className="mb-2 font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-3">Weightlifting catalog</div>
        {catalogShown.length === 0 ? (
          <p className="text-[13px] text-ink-3">No movement videos yet.</p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {catalogShown.map((c) => <MovementRow key={c.slug} item={c} video={videos[c.slug]} canManage={canManage} />)}
          </div>
        )}
      </section>

      {(custom.length > 0 || canManage) && (
        <section>
          <div className="mb-2 font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-3">Gym movements</div>
          <div className="flex flex-col gap-2.5">
            {custom.map((c) => <MovementRow key={c.slug} item={c} video={videos[c.slug]} canManage={canManage} />)}
            {canManage && <AddCustom />}
          </div>
        </section>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Add the nav entry + `play` icon** — `src/components/sidebar.tsx`.

Add a `play` icon to the `ICON_PATHS` object (a triangle play glyph):

```tsx
  play: 'M8 5v14l11-7z',
```

Add to the athlete items (visible to everyone, like `timer`), after the `lifts` push:

```tsx
  athleteItems.push({ key: 'movements', label: 'Movements', href: '/dashboard/movements', icon: 'play' })
```

> Match the exact `ICON_PATHS` entry style in the file (some use `<path d=…>` strings, some full SVG markup — mirror whatever the neighbors use; if icons are full `<path .../>` elements, write `play: <path d="M8 5v14l11-7z" />`).

- [ ] **Step 4: Full gate**

Run: `npm run lint && npm run type-check && npm run test`
Expected: clean, 0 errors, all green.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/movements/page.tsx src/app/dashboard/movements/_components/movement-library.tsx src/components/sidebar.tsx
git commit -m "feat(movements): library page with inline embeds + staff curation + nav (#82)"
```

---

### Task 4: Inline ▶ demo on the program view + daily WOD

**Files:**
- Modify: `src/app/dashboard/program/page.tsx`
- Modify: `src/app/dashboard/program/_components/exercise-logger.tsx`
- Modify: `src/app/dashboard/wod/page.tsx`

**Interfaces:**
- Consumes: the box's set of `movement_videos.slug` (a lightweight read per page).

> **Test approach:** UI deep-links guarded by a slug set; gate = type-check + full suite green + manual. No new unit test.

- [ ] **Step 1: Program view — fetch slugs + pass to the logger** — `src/app/dashboard/program/page.tsx`.

After the program is loaded, fetch the box's video slugs:

```ts
  const { data: vids } = await supabase.from('movement_videos').select('slug').eq('box_id', profile.box_id)
  const videoSlugs = new Set(((vids ?? []) as { slug: string }[]).map((v) => v.slug))
```

Where it renders each exercise (`s.exercises.map((ex) => <ExerciseLogger key={ex.id} exercise={ex} today={today} />)`), pass the video slug when the exercise's lift has a video:

```tsx
                          s.exercises.map((ex) => (
                            <ExerciseLogger
                              key={ex.id}
                              exercise={ex}
                              today={today}
                              videoSlug={ex.lift_name && videoSlugs.has(ex.lift_name) ? ex.lift_name : null}
                            />
                          ))
```

- [ ] **Step 2: ExerciseLogger — render the ▶ link** — `src/app/dashboard/program/_components/exercise-logger.tsx`.

Add `import Link from 'next/link'` (if not present) and the optional prop; render a ▶ next to the exercise name. Update the signature:

```tsx
export function ExerciseLogger({ exercise, today, videoSlug }: { exercise: LoggableExercise; today: string; videoSlug?: string | null }) {
```

In the exercise-name header block, after the name, add:

```tsx
            {videoSlug && (
              <Link href={`/dashboard/movements#${videoSlug}`} className="ml-1.5 text-[11px] text-accent-ink underline" title="Watch demo">▶ demo</Link>
            )}
```

(Optional prop → existing callers unaffected.)

- [ ] **Step 3: Daily WOD — ▶ on the strength card** — `src/app/dashboard/wod/page.tsx`.

After loading `wod`, fetch the slug set (only needed when there's a strength lift):

```ts
  const { data: wodVids } = wod?.strength_lift
    ? await supabase.from('movement_videos').select('slug').eq('box_id', profile.box_id).eq('slug', wod.strength_lift).maybeSingle()
    : { data: null }
  const hasLiftVideo = !!wodVids
```

In the strength card, beside `{wod.strength_title}`, add the link when `hasLiftVideo`:

```tsx
            {hasLiftVideo && (
              <Link href={`/dashboard/movements#${wod.strength_lift}`} className="ml-2 align-middle text-[12px] text-accent-ink underline">▶ demo</Link>
            )}
```

(`Link` is already imported in `wod/page.tsx`.)

- [ ] **Step 4: Full gate**

Run: `npm run lint && npm run type-check && npm run test`
Expected: clean, 0 errors, all green (the `ExerciseLogger` prop is optional → no regression in its other callers).

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/program/page.tsx src/app/dashboard/program/_components/exercise-logger.tsx src/app/dashboard/wod/page.tsx
git commit -m "feat(movements): inline ▶ demo links on the program view + daily WOD (#82)"
```

---

## PR-body Guard / RLS alignment table

```markdown
## Guard / RLS alignment

Migration 085 adds `movement_videos` (box-read + programming-manage). `?`/slug reads are box-scoped.

| Table / surface | G (guard) | P (policy) | G ⊆ P? |
|---|---|---|---|
| movements/page.tsx + program/wod slug reads (movement_videos) | requirePage (all box roles) | movement_videos_box_read (box_id = auth_box_id()) | ✓ |
| movements/_actions (save/delete movement_videos) | requireProgrammingAction (programming) | movement_videos_programming_manage (programming) | ✓ |
```

> `verify-policy-roles` will behaviorally seed `movement_videos` — the first column above starts with a surface path, not a bare table name, so it is skipped by the seeder; the table's box-read/programming-manage policies are standard and covered by `rls-isolation`.

---

## Verification (whole branch, before PR)

- Full gate in the worktree: `npm run lint && npm run type-check && npm run test` — green.
- Adversarial review (focus on the two security cruxes): `client-boundary-auditor` (the `toEmbedUrl` allow-list is the only path to an iframe `src`; the new client component imports only the action + pure lib + UI; no secret), `supabase-migration-reviewer` (085 idempotency + RLS + ROLLBACKS), `tenant-isolation-reviewer` (every `movement_videos` query box-scoped; the slug reads on program/wod box-scoped), `regression-analyzer` (the optional `ExerciseLogger` prop + the CSP widening — confirm Stripe framing unaffected and `frame-ancestors 'none'` intact).
- **CSP manual check** (post-deploy): a real YouTube + Vimeo embed renders on `/dashboard/movements` (no CSP console error); a pasted non-YouTube/Vimeo link is rejected on save with "Use a YouTube or Vimeo link."
- CI: all 6 required checks green incl. `access-control-table` + `verify-policy-roles` + `rls-isolation` (replays 085).
- Manual: staff add a video to Back Squat + a custom "Double-unders" → members see embedded players; a ▶ demo link appears beside Back Squat on the daily WOD + on a program exercise → jumps to the library entry. Box B can't see box A's videos.
- ⚙️ Apply `migrations/085_movement_videos.sql` by hand in the Supabase SQL Editor (feature inert until applied).

## Scope boundaries (documented)
In: per-gym movement→video library (catalog + custom), inline embeds, staff curation, ▶ deep-links on program + WOD. **Out:** self-hosting/upload, whiteboard/TV embeds, inline popover players, auto-detecting metcon movements, multiple videos per movement, cross-gym default library.
