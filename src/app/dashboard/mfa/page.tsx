import { requirePage } from '@/lib/auth/page-guards'
import { MfaVerifyForm } from './_components/mfa-verify-form'

export default async function MfaPage() {
  const { boxName } = await requirePage()
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4 py-8">
      <div className="w-full max-w-sm text-center">
        <div className="mb-3.5 inline-block rounded-lg border border-line bg-surface px-3.5 py-1 font-mono text-xs uppercase tracking-[0.08em] text-ink-3">
          {boxName}
        </div>
        <h1 className="mb-2 font-display text-2xl font-bold tracking-[-0.02em] text-ink">Two-factor check</h1>
        <p className="mb-6 text-sm text-ink-3">Enter the 6-digit code from your authenticator app.</p>
        <MfaVerifyForm />
      </div>
    </div>
  )
}
