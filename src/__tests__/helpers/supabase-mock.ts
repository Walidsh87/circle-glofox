import { vi } from 'vitest'

export type MockResult = { data: unknown; error: unknown }

/**
 * Minimal chainable mock of the Supabase client (query builder + auth) — enough to
 * test server-action authz orchestration without a database.
 *
 * `.from(table)` returns the SAME builder per table (so tests can inspect calls
 * afterward via `.builder(table)`), and terminals (`.single` / `.maybeSingle` /
 * `await`) resolve to the configured per-table result.
 */
export function makeSupabaseMock(opts: {
  user?: { id: string } | null
  results?: Record<string, MockResult>
  rpc?: MockResult
}) {
  const results = opts.results ?? {}
  const builders: Record<string, ReturnType<typeof makeBuilder>> = {}

  function makeBuilder(table: string) {
    const result: MockResult = results[table] ?? { data: null, error: null }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {}
    for (const m of ['select', 'insert', 'update', 'delete', 'eq', 'in', 'order', 'limit', 'is', 'not', 'gte', 'gt']) {
      b[m] = vi.fn(() => b)
    }
    b.single = vi.fn(() => Promise.resolve(result))
    b.maybeSingle = vi.fn(() => Promise.resolve(result))
    // Make the builder awaitable (for queries without .single()).
    b.then = (resolve: (r: MockResult) => unknown) => resolve(result)
    return b
  }

  return {
    auth: {
      getUser: vi.fn(() => Promise.resolve({ data: { user: opts.user ?? null }, error: null })),
      admin: { deleteUser: vi.fn(() => Promise.resolve({ error: null })) },
    },
    from: vi.fn((table: string) => (builders[table] ??= makeBuilder(table))),
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    rpc: vi.fn((_fn: string, _args?: unknown) => Promise.resolve(opts.rpc ?? { data: null, error: null })),
    builder: (table: string) => builders[table],
  }
}
