import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveLocale, type Locale } from './index'

export async function loadRecipientLocales(service: SupabaseClient, ids: string[]): Promise<Map<string, Locale>> {
  const out = new Map<string, Locale>()
  const unique = [...new Set(ids.filter(Boolean))]
  if (unique.length === 0) return out
  const { data } = await service.from('profiles').select('id, language').in('id', unique)
  for (const r of (data ?? []) as { id: string; language: string | null }[]) {
    out.set(r.id, resolveLocale(r.language))
  }
  return out
}

export async function loadRecipientLocalesByEmail(service: SupabaseClient, emails: string[]): Promise<Map<string, Locale>> {
  const out = new Map<string, Locale>()
  const unique = [...new Set(emails.filter(Boolean))]
  if (unique.length === 0) return out
  const { data } = await service.from('profiles').select('email, language').in('email', unique)
  for (const r of (data ?? []) as { email: string | null; language: string | null }[]) {
    if (r.email) out.set(r.email.toLowerCase(), resolveLocale(r.language))
  }
  return out
}
