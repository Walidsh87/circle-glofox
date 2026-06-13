import { AuthLayout, BrandPanel } from '@/components/auth/auth-layout'
import { LoginForm } from '@/components/auth/login-form'
import { LanguageToggle } from '@/components/i18n/language-toggle'
import { getServerT } from '@/lib/i18n/server'

export async function GymLoginForm({
  gymName,
  gymSlug,
  redirectTo,
}: {
  gymName: string
  gymSlug: string
  redirectTo?: string
}) {
  const t = await getServerT()
  return (
    <AuthLayout
      headerExtra={<LanguageToggle />}
      panel={
        <BrandPanel
          eyebrow={t('login.brandEyebrow')}
          headline={gymName}
          description={t('login.brandDescription')}
          footerNote={t('login.poweredBy')}
        />
      }
    >
      <LoginForm
        redirectTo={redirectTo ?? `/join/${gymSlug}`}
        newUserHint={
          <>
            {t('login.newToGym', { gym: gymName })}{' '}
            <span className="font-semibold text-ink">{t('login.createAccountHint')}</span>.
          </>
        }
      />
    </AuthLayout>
  )
}
