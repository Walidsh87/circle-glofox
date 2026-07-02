import { resolveAppTarget } from '@/lib/app-return'
import { AppRedirect } from './_components/app-redirect'

// Public trampoline for mobile Stripe checkout: Stripe requires https redirect URLs, so the
// /api/app checkout sessions point here and this page immediately deep-links back into the
// native app, which closes the in-app browser sheet. No auth, no data. `to` is the app's own
// runtime deep link (Expo Go vs standalone schemes differ) — re-validated here because anyone
// can hit this URL directly; junk falls back to the standalone scheme. Never http(s).
export const dynamic = 'force-dynamic'

export const metadata = { robots: { index: false, follow: false } }

export default async function CheckoutReturnPage(ctx: { searchParams: Promise<{ status?: string; to?: string }> }) {
  const { status, to } = await ctx.searchParams
  const safe = status === 'success' ? 'success' : 'cancel'
  const appUrl = `${resolveAppTarget(to)}?status=${safe}`
  return (
    <div data-theme="light" className="min-h-screen bg-canvas">
      <div className="mx-auto max-w-[440px] px-6 pt-20 text-center">
        <h1 className="mb-3 font-display text-[22px] font-semibold text-ink">
          {safe === 'success' ? 'Payment complete' : 'Checkout closed'}
        </h1>
        <p className="mb-5 text-sm text-ink-3">Taking you back to the app…</p>
        <AppRedirect appUrl={appUrl} />
      </div>
    </div>
  )
}
