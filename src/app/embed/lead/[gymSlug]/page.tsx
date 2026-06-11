import { createServiceClient } from '@/lib/supabase/service'
import { notFound } from 'next/navigation'
import { LeadForm } from './_components/lead-form'

export default async function LeadEmbedPage(ctx: { params: Promise<{ gymSlug: string }>; searchParams: Promise<{ ref?: string }> }) {
  const { gymSlug } = await ctx.params
  const { ref } = await ctx.searchParams
  const service = createServiceClient()
  const { data: box } = await service.from('boxes').select('name, logo_url').eq('slug', gymSlug).single()
  if (!box) notFound()

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)' }}>
      <div style={{ width: '100%', maxWidth: 420, background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 16, padding: '28px 26px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {box.logo_url && <img src={box.logo_url} alt="" width={40} height={40} style={{ borderRadius: 8, objectFit: 'cover' }} />}
          <div>
            <div style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 18, fontWeight: 600, color: 'var(--c-ink)' }}>{box.name}</div>
            <div style={{ fontSize: 13, color: 'var(--c-ink-muted)' }}>Get started — leave your details below.</div>
          </div>
        </div>
        <LeadForm gymSlug={gymSlug} refCode={ref} />
      </div>
    </div>
  )
}
