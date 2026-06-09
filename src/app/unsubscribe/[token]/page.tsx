import { UnsubscribeForm } from './_components/unsubscribe-form'

export default async function UnsubscribePage(ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  return (
    <div style={{ maxWidth: 440, margin: '80px auto', padding: '0 24px', fontFamily: 'var(--font-geist-sans)' }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 12 }}>Unsubscribe</h1>
      <p style={{ fontSize: 14, color: 'var(--c-ink-muted)', marginBottom: 20 }}>
        Click below to stop receiving broadcast emails. Billing and account notifications will still be sent.
      </p>
      <UnsubscribeForm token={token} />
    </div>
  )
}
