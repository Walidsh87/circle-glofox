import { vi } from 'vitest'

export type MockResult = { data: unknown; error: unknown; count?: number }

/**
 * Minimal chainable mock of the Supabase client (query builder + auth) — enough to
 * test server-action authz orchestration without a database.
 *
 * `.from(table)` returns the SAME builder per table (so tests can inspect calls
 * afterward via `.builder(table)`), and terminals (`.single` / `.maybeSingle` /
 * `await`) resolve to the configured per-table result.
 *
 * A table's result may be an ARRAY: each terminal call consumes the next entry
 * (the last entry sticks) — for actions that hit the same table more than once.
 */
export function makeSupabaseMock(opts: {
  user?: { id: string } | null
  results?: Record<string, MockResult | MockResult[]>
  rpc?: MockResult
  adminFactors?: { id: string }[]
}) {
  const results = opts.results ?? {}
  const builders: Record<string, ReturnType<typeof makeBuilder>> = {}

  function makeBuilder(table: string) {
    const configured = results[table] ?? { data: null, error: null }
    const queue = Array.isArray(configured) ? [...configured] : null
    const next = (): MockResult =>
      queue
        ? (queue.length > 1 ? queue.shift()! : (queue[0] ?? { data: null, error: null }))
        : (configured as MockResult)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {}
    for (const m of ['select', 'insert', 'upsert', 'update', 'delete', 'eq', 'in', 'order', 'limit', 'is', 'not', 'gte', 'lte', 'gt', 'lt', 'ilike', 'or']) {
      b[m] = vi.fn(() => b)
    }
    b.single = vi.fn(() => Promise.resolve(next()))
    b.maybeSingle = vi.fn(() => Promise.resolve(next()))
    // Make the builder awaitable (for queries without .single()).
    b.then = (resolve: (r: MockResult) => unknown) => resolve(next())
    return b
  }

  return {
    auth: {
      getUser: vi.fn(() => Promise.resolve({ data: { user: opts.user ?? null }, error: null })),
      admin: {
        deleteUser: vi.fn(() => Promise.resolve({ error: null })),
        createUser: vi.fn(() => Promise.resolve({ data: { user: { id: 'new1' } }, error: null })),
        mfa: {
          listFactors: vi.fn(() => Promise.resolve({ data: { factors: opts.adminFactors ?? [] }, error: null })),
          deleteFactor: vi.fn(() => Promise.resolve({ data: null, error: null })),
        },
      },
    },
    from: vi.fn((table: string) => (builders[table] ??= makeBuilder(table))),
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    rpc: vi.fn((_fn: string, _args?: unknown) => Promise.resolve(opts.rpc ?? { data: null, error: null })),
    builder: (table: string) => builders[table],
  }
}
