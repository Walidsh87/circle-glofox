import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'
import { requirePage, requireStaffPage, requireOwnerPage } from '@/lib/auth/page-guards'
import { requireUserAction, requireOwnerAction, requireStaffAction } from '@/lib/auth/action-guards'
import { createServiceClient } from '@/lib/supabase/service'

const serverCreate = vi.hoisted(() => vi.fn())
const serviceCreate = vi.hoisted(() => vi.fn(() => ({ service: true })))
const redirectMock = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  })
)

vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('@supabase/supabase-js', () => ({ createClient: serviceCreate }))
vi.mock('next/navigation', () => ({ redirect: redirectMock }))

function ownerProfile(overrides: Record<string, unknown> = {}) {
  return {
    id: 'u1',
    full_name: 'Walid',
    role: 'owner',
    box_id: 'b1',
    boxes: { name: 'Circle', timezone: 'Asia/Dubai', slug: 'circle' },
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('requirePage', () => {
  it('redirects to / when there is no user', async () => {
    serverCreate.mockResolvedValue(makeSupabaseMock({ user: null }))
    await expect(requirePage()).rejects.toThrow('REDIRECT:/')
  })

  it('redirects to /onboarding when there is no profile', async () => {
    serverCreate.mockResolvedValue(
      makeSupabaseMock({ user: { id: 'u1' }, results: { profiles: { data: null, error: null } } })
    )
    await expect(requirePage()).rejects.toThrow('REDIRECT:/onboarding')
  })

  it('returns profile, boxName and box on the happy path (object join)', async () => {
    serverCreate.mockResolvedValue(
      makeSupabaseMock({ user: { id: 'u1' }, results: { profiles: { data: ownerProfile(), error: null } } })
    )
    const ctx = await requirePage()
    expect(ctx.profile).toEqual({ id: 'u1', full_name: 'Walid', role: 'owner', box_id: 'b1' })
    expect(ctx.boxName).toBe('Circle')
    expect(ctx.box).toEqual({ name: 'Circle', timezone: 'Asia/Dubai', slug: 'circle' })
  })

  it('unwraps an array boxes join and tolerates missing fields', async () => {
    serverCreate.mockResolvedValue(
      makeSupabaseMock({
        user: { id: 'u1' },
        results: { profiles: { data: ownerProfile({ boxes: [{ name: 'Circle' }] }), error: null } },
      })
    )
    const ctx = await requirePage()
    expect(ctx.boxName).toBe('Circle')
    expect(ctx.box).toEqual({ name: 'Circle', timezone: null, slug: null })
  })

  it('returns empty boxName when the join is null', async () => {
    serverCreate.mockResolvedValue(
      makeSupabaseMock({
        user: { id: 'u1' },
        results: { profiles: { data: ownerProfile({ boxes: null }), error: null } },
      })
    )
    const ctx = await requirePage()
    expect(ctx.boxName).toBe('')
  })
})

describe('requireStaffPage', () => {
  it('redirects athletes to /dashboard', async () => {
    serverCreate.mockResolvedValue(
      makeSupabaseMock({
        user: { id: 'u1' },
        results: { profiles: { data: ownerProfile({ role: 'athlete' }), error: null } },
      })
    )
    await expect(requireStaffPage()).rejects.toThrow('REDIRECT:/dashboard')
  })

  it('lets coaches through', async () => {
    serverCreate.mockResolvedValue(
      makeSupabaseMock({
        user: { id: 'u1' },
        results: { profiles: { data: ownerProfile({ role: 'coach' }), error: null } },
      })
    )
    const ctx = await requireStaffPage()
    expect(ctx.profile.role).toBe('coach')
  })
})

describe('requireOwnerPage', () => {
  it('redirects coaches to /dashboard', async () => {
    serverCreate.mockResolvedValue(
      makeSupabaseMock({
        user: { id: 'u1' },
        results: { profiles: { data: ownerProfile({ role: 'coach' }), error: null } },
      })
    )
    await expect(requireOwnerPage()).rejects.toThrow('REDIRECT:/dashboard')
  })

  it('lets owners through', async () => {
    serverCreate.mockResolvedValue(
      makeSupabaseMock({ user: { id: 'u1' }, results: { profiles: { data: ownerProfile(), error: null } } })
    )
    const ctx = await requireOwnerPage()
    expect(ctx.profile.role).toBe('owner')
  })
})

describe('requireUserAction', () => {
  it('returns Not authenticated. without a user and never touches profiles', async () => {
    const mock = makeSupabaseMock({ user: null })
    serverCreate.mockResolvedValue(mock)
    const res = await requireUserAction()
    expect(res).toEqual({ error: 'Not authenticated.' })
    expect(mock.from).not.toHaveBeenCalled()
  })

  it('returns the client and user when signed in', async () => {
    const mock = makeSupabaseMock({ user: { id: 'u1' } })
    serverCreate.mockResolvedValue(mock)
    const res = await requireUserAction()
    expect('error' in res).toBe(false)
    if (!('error' in res)) expect(res.user.id).toBe('u1')
  })
})

describe('requireOwnerAction', () => {
  it('returns Not authenticated. without a user', async () => {
    serverCreate.mockResolvedValue(makeSupabaseMock({ user: null }))
    expect(await requireOwnerAction('Only owners can do this.')).toEqual({ error: 'Not authenticated.' })
  })

  it('returns the custom message when the profile is missing', async () => {
    serverCreate.mockResolvedValue(
      makeSupabaseMock({ user: { id: 'u1' }, results: { profiles: { data: null, error: null } } })
    )
    expect(await requireOwnerAction('Only owners can add members.')).toEqual({
      error: 'Only owners can add members.',
    })
  })

  it('returns the custom message for non-owners', async () => {
    serverCreate.mockResolvedValue(
      makeSupabaseMock({
        user: { id: 'u1' },
        results: { profiles: { data: { box_id: 'b1', role: 'coach' }, error: null } },
      })
    )
    expect(await requireOwnerAction('Only owners can issue refunds.')).toEqual({
      error: 'Only owners can issue refunds.',
    })
  })

  it('returns the context for owners', async () => {
    serverCreate.mockResolvedValue(
      makeSupabaseMock({
        user: { id: 'u1' },
        results: { profiles: { data: { box_id: 'b1', role: 'owner' }, error: null } },
      })
    )
    const res = await requireOwnerAction('nope')
    expect('error' in res).toBe(false)
    if (!('error' in res)) expect(res.profile).toEqual({ box_id: 'b1', role: 'owner' })
  })
})

describe('requireStaffAction', () => {
  it('lets coaches through', async () => {
    serverCreate.mockResolvedValue(
      makeSupabaseMock({
        user: { id: 'u1' },
        results: { profiles: { data: { box_id: 'b1', role: 'coach' }, error: null } },
      })
    )
    const res = await requireStaffAction('Staff only.')
    expect('error' in res).toBe(false)
  })

  it('returns the custom message for athletes', async () => {
    serverCreate.mockResolvedValue(
      makeSupabaseMock({
        user: { id: 'u1' },
        results: { profiles: { data: { box_id: 'b1', role: 'athlete' }, error: null } },
      })
    )
    expect(await requireStaffAction('Staff only.')).toEqual({ error: 'Staff only.' })
  })
})

describe('createServiceClient', () => {
  it('constructs a fresh client with env credentials on each call', () => {
    createServiceClient()
    expect(serviceCreate).toHaveBeenCalledWith(
      'https://example.supabase.co',
      'test-service-role-key',
      undefined
    )
  })

  it('passes options through (no-store fetch wrappers in cron routes)', () => {
    const options = { global: { fetch } }
    createServiceClient(options)
    expect(serviceCreate).toHaveBeenCalledWith('https://example.supabase.co', 'test-service-role-key', options)
  })
})
