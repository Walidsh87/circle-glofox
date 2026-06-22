'use server'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'

export async function dismissOnboarding() {
  ;(await cookies()).set('cf_onboarding_dismissed', '1', { maxAge: 60 * 60 * 24 * 365, path: '/', sameSite: 'lax' })
  revalidatePath('/dashboard')
}
