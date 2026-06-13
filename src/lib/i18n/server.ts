import { cookies, headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { resolveLocale, getT, type Locale, type TFn } from '@/lib/i18n'

export const LOCALE_COOKIE = 'locale'

// One context-aware resolution per request (call once in the root layout):
//  /embed/* → 'en' (out of scope, English-only); authed → own profiles.language
//  (so staff, whose language is 'en', never flip — even on a shared browser);
//  anonymous → cookie (the pre-login toggle). A logged-in user's account language
//  always wins over the cookie, so an Arabic cookie can't leak into an owner's view.
export async function getLocale(): Promise<Locale> {
  const pathname = (await headers()).get('x-pathname') ?? ''
  if (pathname.startsWith('/embed')) return 'en'

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    const service = createServiceClient()
    const { data } = await service.from('profiles').select('language').eq('id', user.id).maybeSingle()
    return resolveLocale(data?.language)
  }

  const cookie = (await cookies()).get(LOCALE_COOKIE)?.value
  if (cookie) return resolveLocale(cookie)

  return 'en'
}

export async function getServerT(): Promise<TFn> {
  return getT(await getLocale())
}
