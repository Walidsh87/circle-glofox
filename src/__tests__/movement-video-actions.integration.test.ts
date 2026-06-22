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
