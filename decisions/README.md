# Decisions (ADR log)

Durable rulings for this system, one per file, **immutable once written**. The point is to never
re-argue a settled question: each entry records the ruling *and the reasoning*, so a fresh chat — or
future-you — reads *why* and moves on instead of reopening it. Mirrors the migrations convention:
numbered, sequential, append-only.

This log is the record of *why*. The *active* rule a build must follow lives in `CLAUDE.md` (which the
hooks and CI enforce around). When a decision sets a build rule, update both — the ADR for the reasoning,
`CLAUDE.md` for the instruction.

## Index

| #   | Decision                                                          | Status   | Date       |
|-----|-------------------------------------------------------------------|----------|------------|
| [001](001_service_role_key_is_server_only.md) | Supabase service-role key is server-only — never client-exposed | Accepted | 2026-06-17 |
| [002](002_modular_monolith_no_microservices.md) | Modular monolith on Vercel + Supabase — no custom microservices | Accepted | 2026-06-21 |
| [003](003_consolidated_audit_docs.md) | Consolidated all audit docs into one on-demand checklist (`docs/audit/CHECKLIST.md`) | Accepted | 2026-06-28 |

## How to add one

Run the `log-decision` skill — or by hand: take the highest number + 1 (zero-padded to 3), write
`NNN_short_snake.md` with the `# NNN. Title` + Status/Date header and the Context / Decision / Reasoning /
Consequences sections, then add a row above. Keep the table sorted by number.

## Changing a past decision — supersede, never edit

Never rewrite a decided file's ruling; that erases the history of why it ever said otherwise. Instead:

1. Write a **new** entry with the new ruling and `Supersedes: NNN`.
2. In the **old** file, set `Status: Superseded` and `Superseded by: NNN` — the only edit a decided file ever gets.
3. Update both rows here.

## What belongs here

Durable rulings only — architecture and tech choices, scope boundaries, conventions with live
alternatives, safety rulings. The test: *would re-arguing this later waste real time?* Not transient
gotchas or how-it-works trivia (those are code comments or per-feature notes), not task status, not
anything with one obvious answer nobody would dispute. A bloated log is a log nobody reads.
