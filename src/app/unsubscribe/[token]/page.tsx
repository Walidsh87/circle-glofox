import { UnsubscribeForm } from './_components/unsubscribe-form'

export default async function UnsubscribePage(ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  return (
    <div data-theme="light" className="min-h-screen bg-canvas">
      <div className="mx-auto max-w-[440px] px-6 pt-20">
        <h1 className="mb-3 font-display text-[22px] font-semibold text-ink">Unsubscribe</h1>
        <p className="mb-5 text-sm text-ink-3">
          Click below to stop receiving broadcast emails. Billing and account notifications will still be sent.
        </p>
        <UnsubscribeForm token={token} />
      </div>
    </div>
  )
}
