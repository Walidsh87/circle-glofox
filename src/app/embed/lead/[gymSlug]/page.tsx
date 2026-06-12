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
    <div data-theme="light" className="flex min-h-screen items-center justify-center bg-canvas p-5">
      <div className="w-full max-w-[420px] rounded-2xl border border-line bg-surface px-[26px] py-7">
        <div className="mb-[18px] flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {box.logo_url && <img src={box.logo_url} alt="" width={40} height={40} className="rounded-lg object-cover" />}
          <div>
            <div className="font-display text-lg font-semibold text-ink">{box.name}</div>
            <div className="text-[13px] text-ink-3">Get started — leave your details below.</div>
          </div>
        </div>
        <LeadForm gymSlug={gymSlug} refCode={ref} />
      </div>
    </div>
  )
}
