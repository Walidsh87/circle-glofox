import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeSupabaseMock } from '@/__tests__/helpers/supabase-mock'

const { requireProg } = vi.hoisted(() => ({ requireProg: vi.fn() }))
vi.mock('@/lib/auth/action-guards', () => ({ requireProgrammingAction: requireProg }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))

async function load() { vi.resetModules(); return import('@/app/dashboard/feed/_actions/debrief') }
beforeEach(() => requireProg.mockReset())

describe('postDebrief', () => {
  it('rejects an empty recap before any DB write', async () => {
    const { postDebrief } = await load()
    const res = await postDebrief('   ')
    expect(res.error).toMatch(/recap/i)
    expect(requireProg).not.toHaveBeenCalled()
  })

  it('inserts box-scoped with coach_id + the day WOD-title snapshot', async () => {
    const sb = makeSupabaseMock({ results: {
      boxes: { data: { timezone: 'Asia/Dubai' }, error: null },
      workouts: { data: { title: 'Fran' }, error: null },
      class_debriefs: { data: null, error: null },
    } })
    requireProg.mockResolvedValue({ supabase: sb, user: { id: 'c1' }, profile: { box_id: 'b1', role: 'coach', full_name: 'C' } })
    const { postDebrief } = await load()
    const res = await postDebrief('Strong session.')
    expect(res.error).toBeNull()
    expect(sb.builder('class_debriefs').insert).toHaveBeenCalledWith(
      expect.objectContaining({ box_id: 'b1', coach_id: 'c1', body: 'Strong session.', wod_title: 'Fran' }),
    )
  })

  it('is denied for a non-programming role', async () => {
    requireProg.mockResolvedValue({ error: 'Only coaches can post a recap.' })
    const { postDebrief } = await load()
    expect((await postDebrief('hi')).error).toMatch(/coaches/i)
  })
})

describe('deleteDebrief', () => {
  it('deletes box + id scoped', async () => {
    const sb = makeSupabaseMock({ results: { class_debriefs: { data: null, error: null } } })
    requireProg.mockResolvedValue({ supabase: sb, user: { id: 'c1' }, profile: { box_id: 'b1', role: 'coach', full_name: 'C' } })
    const { deleteDebrief } = await load()
    const res = await deleteDebrief('dbr-1')
    expect(res.error).toBeNull()
    const b = sb.builder('class_debriefs')
    expect(b.delete).toHaveBeenCalled()
    expect(b.eq).toHaveBeenCalledWith('box_id', 'b1')
    expect(b.eq).toHaveBeenCalledWith('id', 'dbr-1')
  })
})
