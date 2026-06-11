import { AuthLayout, BrandPanel } from '@/components/auth/auth-layout'
import { LoginForm } from '@/components/auth/login-form'

export default function LoginPage() {
  return (
    <AuthLayout
      panel={
        <BrandPanel
          eyebrow="Gym Management"
          headline={
            <>
              Manage.
              <br />
              Track.
              <br />
              Win.
            </>
          }
          detail={
            <>
              Classes · Members · WODs
              <br />
              1RMs · Leaderboards · Payments
            </>
          }
          description="Built for CrossFit boxes and boutique gyms across the GCC."
          footerNote="UAE · KSA · Qatar · Kuwait"
        />
      }
    >
      <LoginForm
        redirectTo="/dashboard"
        newUserHint={
          <>
            New to Circle?{' '}
            <span className="font-semibold text-ink">Ask your coach for an invite</span>.
          </>
        }
      />
    </AuthLayout>
  )
}
