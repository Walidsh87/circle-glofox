import { redirect } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { ALL_STAFF_ROLES, MANAGER_ROLES, PROGRAMMING_ROLES, type Role } from '@/lib/auth/roles'

export type GuardedBox = { name: string; timezone: string | null; slug: string | null }

export type PageContext = {
  supabase: Awaited<ReturnType<typeof createClient>>
  user: User
  profile: { id: string; full_name: string | null; role: Role; box_id: string }
  boxName: string
  box: GuardedBox
}

type BoxJoin = GuardedBox | GuardedBox[] | null

type ProfileRow = {
  id: string
  full_name: string | null
  role: Role
  box_id: string
  boxes: BoxJoin
}

function unwrapBox(boxes: BoxJoin): GuardedBox {
  const box = Array.isArray(boxes) ? (boxes[0] ?? null) : boxes
  return { name: box?.name ?? '', timezone: box?.timezone ?? null, slug: box?.slug ?? null }
}

/** Any signed-in user with a profile; redirects '/' (no session) or '/onboarding' (no profile). */
export async function requirePage(): Promise<PageContext> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, role, box_id, boxes(name, timezone, slug)')
    .eq('id', user.id)
    .single()
  if (!profile) redirect('/onboarding')

  const row = profile as unknown as ProfileRow
  const box = unwrapBox(row.boxes)
  return {
    supabase,
    user,
    profile: { id: row.id, full_name: row.full_name, role: row.role, box_id: row.box_id },
    boxName: box.name,
    box,
  }
}

async function requireRolePage(roles: readonly string[]): Promise<PageContext> {
  const ctx = await requirePage()
  if (!roles.includes(ctx.profile.role)) redirect('/dashboard')
  return ctx
}

/** Any staff role (incl. receptionist); anyone else lands back on /dashboard. */
export function requireStaffPage(): Promise<PageContext> {
  return requireRolePage(ALL_STAFF_ROLES)
}

/** Owner or admin; anyone else lands back on /dashboard. */
export function requireManagerPage(): Promise<PageContext> {
  return requireRolePage(MANAGER_ROLES)
}

/** Owner/admin/coach (workout & class authoring); anyone else lands back on /dashboard. */
export function requireProgrammingPage(): Promise<PageContext> {
  return requireRolePage(PROGRAMMING_ROLES)
}

/** Owner only; anyone else lands back on /dashboard. */
export function requireOwnerPage(): Promise<PageContext> {
  return requireRolePage(['owner'])
}
