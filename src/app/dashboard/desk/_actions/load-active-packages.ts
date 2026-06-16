'use server'

import { requireStaffAction } from '@/lib/auth/action-guards'

export type PackageOption = { id: string; name: string; price_aed: number }
type State = { error: string | null; packages?: PackageOption[] }

export async function loadActivePackages(): Promise<State> {
  const auth = await requireStaffAction('Only staff can use the front desk.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, profile } = auth

  const { data, error } = await supabase
    .from('packages')
    .select('id, name, price_aed')
    .eq('box_id', profile.box_id)
    .eq('active', true)
    .order('name')
  if (error) return { error: error.message }
  return { error: null, packages: (data ?? []).map((p) => ({ id: p.id, name: p.name, price_aed: Number(p.price_aed) })) }
}
