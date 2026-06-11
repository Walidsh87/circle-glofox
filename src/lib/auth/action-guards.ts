import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { ALL_STAFF_ROLES, MANAGER_ROLES, PROGRAMMING_ROLES, type Role } from '@/lib/auth/roles'

export type ActionDenied = { error: string }

export type UserActionContext = {
  supabase: Awaited<ReturnType<typeof createClient>>
  user: User
}

export type StaffActionContext = UserActionContext & {
  profile: { box_id: string; role: Role }
}

const NOT_AUTHENTICATED = 'Not authenticated.'

/** Signed-in check only — for actions with bespoke profile needs. */
export async function requireUserAction(): Promise<UserActionContext | ActionDenied> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NOT_AUTHENTICATED }
  return { supabase, user }
}

async function requireRoleAction(roles: readonly string[], msg: string): Promise<StaffActionContext | ActionDenied> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NOT_AUTHENTICATED }

  const { data: profile } = await supabase.from('profiles').select('box_id, role').eq('id', user.id).single()
  if (!profile || !roles.includes((profile as { role: string }).role)) return { error: msg }
  return { supabase, user, profile: profile as StaffActionContext['profile'] }
}

/** Owner-only mutation; `msg` is the action's denial copy (kept per-action for test parity). */
export function requireOwnerAction(msg: string): Promise<StaffActionContext | ActionDenied> {
  return requireRoleAction(['owner'], msg)
}

/** Owner-or-admin mutation; `msg` is the action's denial copy. */
export function requireManagerAction(msg: string): Promise<StaffActionContext | ActionDenied> {
  return requireRoleAction(MANAGER_ROLES, msg)
}

/** Owner/admin/coach mutation (workout & class authoring); `msg` is the denial copy. */
export function requireProgrammingAction(msg: string): Promise<StaffActionContext | ActionDenied> {
  return requireRoleAction(PROGRAMMING_ROLES, msg)
}

/** Any staff mutation (incl. receptionist); `msg` is the action's denial copy. */
export function requireStaffAction(msg: string): Promise<StaffActionContext | ActionDenied> {
  return requireRoleAction(ALL_STAFF_ROLES, msg)
}
