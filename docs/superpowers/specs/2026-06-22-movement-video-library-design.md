# Movement / video library (#82)

**Date:** 2026-06-22
**Status:** Design approved (Walid), ready for implementation plan
**Roadmap:** v2 Tier 10 #82 — every WOD/program movement linked to a demo video. Reinforces the wedge (programming layer).

## Summary

A per-gym library mapping movements → demo videos, with **inline embedded players** (YouTube/Vimeo). Owner/coach curates a movement → video URL; members browse a `/dashboard/movements` page (catalog + gym-added movements, grouped, each with an embedded player) and tap a **▶ demo** link beside a movement on the program view / daily WOD to jump to it. Link-based (no self-hosting); the only embeddable hosts are YouTube + Vimeo, enforced at the input boundary **and** at render.

## Scope decisions (confirmed)

| Question | Decision |
|---|---|
| Video source | **Embedded inline players** from pasted YouTube/Vimeo URLs (no upload/Storage). Requires a scoped CSP `frame-src` widening to the two embed hosts. |
| Coverage | **Catalog + custom gym movements** — the 29 `LIFT_NAMES` plus staff-added free-text movements (double-unders, wall balls…). `movement_videos` keyed by a normalized `slug`. |
| Who curates | Programming tier (owner/admin/coach). |
| Who watches | Every member in the box (box-read RLS). |

## Security — the two cruxes

1. **Embed only allow-listed hosts.** Pure `toEmbedUrl(url)` parses the URL and returns a canonical embed URL **only** for YouTube (`youtube.com/watch?v=`, `youtu.be/`, `/shorts/`, `/embed/`, `youtube-nocookie.com/embed/`) and Vimeo (`vimeo.com/<id>`, `player.vimeo.com/video/<id>`); **null for everything else** (wrong host, `javascript:`/`data:`, look-alike like `youtube.com.evil.com`, missing/bad id). Host matching is **exact hostname equality** against an allow-set (never `includes`). Output is always `https://www.youtube-nocookie.com/embed/<id>` or `https://player.vimeo.com/video/<id>`. This gates writes (validation) and is re-applied at render (an unrenderable row is skipped) — so an arbitrary URL can never become an iframe `src`.
2. **CSP widening is minimal + scoped.** `next.config.mjs` `frame-src` adds exactly `https://www.youtube-nocookie.com https://player.vimeo.com` (it currently allows Stripe only). The change flows into both the app CSP and the derived `/embed` CSP. No other directive changes; `frame-ancestors 'none'` (anti-clickjacking) is untouched.

## Data model — migration `085_movement_videos.sql`

`movement_videos`: `id`, `box_id` (FK boxes CASCADE), `slug TEXT NOT NULL`, `label TEXT NOT NULL`, `video_url TEXT NOT NULL`, `created_by` (FK profiles SET NULL), `created_at`. `UNIQUE (box_id, slug)` (one video per movement per gym). Stores the **original** pasted URL (validated to pass `toEmbedUrl` on write); embed URL is derived at render.

RLS (box-scoped):
- `movement_videos_box_read` — `SELECT USING (box_id = auth_box_id())` (every member watches).
- `movement_videos_programming_manage` — `FOR ALL USING/WITH CHECK (box_id = auth_box_id() AND auth_is_programming())` (staff curate).

G ⊆ P: library page = `requirePage` (all roles) ⊆ box_read (all box roles) ✓; save/delete = `requireProgrammingAction` ⊆ programming_manage ✓.

## Pure logic — `src/lib/movement-video.ts` (TDD, no Supabase)
- `toEmbedUrl(url): { provider: 'youtube' | 'vimeo'; embedUrl: string } | null` — the allow-list + embed conversion above.
- `validateMovementVideo({ slug, label, url }): string | null` — label 1–80, slug matches `^[a-z0-9-]{1,60}$`, url must pass `toEmbedUrl` (else "Use a YouTube or Vimeo link.").
- `movementSlug(name): string` — lowercase, non-alphanumeric → `-`, collapse, trim, cap 60.
- Catalog grouping helper over `LIFT_NAMES` (re-used) — "Weightlifting catalog" group; custom slugs (not in `LIFT_NAMES`) → "Gym movements" group.

## Components
- **`/dashboard/movements`** (server page, `requirePage`): loads the box's `movement_videos`; renders **Weightlifting catalog** (the 29 lifts) + **Gym movements** (custom), each movement with an inline embedded player (`<iframe>` from `toEmbedUrl`, `loading="lazy"`, `allowfullscreen`, `id={slug}` anchor for deep-linking) or a "no video yet" placeholder. Programming-tier viewers also get an editor (paste a URL on a catalog lift; add a custom movement with label + URL; remove). Mirrors `/dashboard/skills` layout + the skills/WodForm editor pattern. Nav entry for everyone (new icon).
- **Inline ▶ demo** on the **program view** (`/dashboard/program`, exercises carry `lift_name`) and the **daily WOD page** (structured strength lift) — a small link shown only for movements that have a video (each page fetches the box's set of video slugs), deep-linking to `/dashboard/movements#<slug>`.

## Actions — `src/app/dashboard/movements/_actions/video.ts`
- `saveMovementVideo(slug, label, url)` — `requireProgrammingAction`, `validateMovementVideo`, upsert on `(box_id, slug)`, box-scoped.
- `deleteMovementVideo(slug)` — `requireProgrammingAction`, delete by `box_id + slug`.

## Testing
- **Pure** (`movement-video.test.ts`): `toEmbedUrl` — accept youtube watch/`youtu.be`/shorts/embed/nocookie + vimeo `/id`/player; **reject** arbitrary host, `youtube.com.evil.com` look-alike, `evil.com/youtube.com`, `javascript:`/`data:`/non-URL, missing/malformed id; output is always the nocookie/player canonical form. `validateMovementVideo` rejection branches. `movementSlug` normalization.
- **Integration** (`movement-video-actions.integration.test.ts`): save rejects a non-YouTube/Vimeo URL; save upserts box-scoped; delete is box+slug scoped; programming-tier gate (athlete denied).
- **RLS/isolation** (CI): box B cannot read box A's `movement_videos`.
- Full gate green; migration 085 applied by hand in Supabase (CI `rls-isolation` replays it).

## Out of scope (documented, future)
- Self-hosting / file upload (no Storage).
- Whiteboard/TV embeds (kiosk surface).
- Inline popover players on the WOD/program (we deep-link to the library instead).
- Auto-detecting free-text metcon movements (staff curate the custom list).
- Per-movement multiple videos / global default library across gyms (per-gym only).
