import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

export type ActionDenied = { error: string }

export type UserActionContext = {
  supabase: Awaited<ReturnType<typeof createClient>>
  user: User
}

export type StaffActionContext = UserActionContext & {
  profile: { box_id: string; role: 'owner' | 'coach' | 'athlete' }
}

const NOT_AUTHENTICATED = 'Not authenticated.'

/** Signed-in check only — for actions with bespoke profile needs. */
export async function requireUserAction(): Promise<UserActionContext | ActionDenied> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NOT_AUTHENTICATED }
  return { supabase, user }
}

async function requireRoleAction(roles: string[], msg: string): Promise<StaffActionContext | ActionDenied> {
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

/** Owner-or-coach mutation; `msg` is the action's denial copy. */
export function requireStaffAction(msg: string): Promise<StaffActionContext | ActionDenied> {
  return requireRoleAction(['owner', 'coach'], msg)
}
