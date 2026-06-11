import { AuthLayout, BrandPanel } from '@/components/auth/auth-layout'
import { LoginForm } from '@/components/auth/login-form'

export function GymLoginForm({
  gymName,
  gymSlug,
  redirectTo,
}: {
  gymName: string
  gymSlug: string
  redirectTo?: string
}) {
  return (
    <AuthLayout
      panel={
        <BrandPanel
          eyebrow="Member Portal"
          headline={gymName}
          description="Book classes, track your WODs, and manage your membership — all in one place."
          footerNote="Powered by Circle"
        />
      }
    >
      <LoginForm
        redirectTo={redirectTo ?? `/join/${gymSlug}`}
        newUserHint={
          <>
            New to {gymName}?{' '}
            <span className="font-semibold text-ink">
              Sign in with a code to create your account
            </span>
            .
          </>
        }
      />
    </AuthLayout>
  )
}
