'use server'

import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { resolveLocale, type Locale } from '@/lib/i18n'
import { LOCALE_COOKIE } from '@/lib/i18n/server'

// Always set the cookie; persist to profiles.language only when authed (the
// public gym-login surface has no session — must not throw there).
export async function setLanguage(locale: Locale): Promise<{ error: string | null }> {
  const safe = resolveLocale(locale)
  const jar = await cookies()
  jar.set(LOCALE_COOKIE, safe, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    const service = createServiceClient()
    await service.from('profiles').update({ language: safe }).eq('id', user.id)
  }
  return { error: null }
}
