import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { env } from '@/env'
import { getDueDate, getReminderStage } from '@/lib/billing-reminders'
import { sendBillingReminderEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'

type Row = {
  id: string
  box_id: string
  start_date: string
  last_paid_date: string | null
  end_date: string | null
  monthly_price_aed: number | null
  athlete_full_name: string
  athlete_email: string | null
  gym_name: string
  reminders_enabled: boolean
  owner_email: string | null
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const today = new Date().toISOString().slice(0, 10)

  const supabase = createServiceClient({
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, { ...init, cache: 'no-store' }),
    },
  })

  const { data, error } = await supabase.rpc('cron_eligible_memberships', { p_today: today })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = (data ?? []) as Row[]
  let processed = 0, sent = 0, skipped = 0
  const errors: string[] = []

  for (const r of rows) {
    processed++
    const dueDate = getDueDate({
      last_paid_date: r.last_paid_date,
      start_date: r.start_date,
      end_date: r.end_date,
    })
    if (!dueDate) { skipped++; continue }
    const stage = getReminderStage(today, dueDate)
    if (!stage) { skipped++; continue }
    if (!r.athlete_email) { skipped++; continue }

    const { data: inserted, error: insertError } = await supabase
      .from('billing_reminders')
      .insert({
        box_id: r.box_id,
        membership_id: r.id,
        stage,
        due_date: dueDate,
        email: r.athlete_email,
      })
      .select('id')
      .single()

    if (insertError) {
      if (insertError.code === '23505') { skipped++; continue }
      errors.push(`insert ${r.id}: ${insertError.message}`)
      continue
    }

    const { id: resendId, error: sendError } = await sendBillingReminderEmail({
      to: r.athlete_email,
      bcc: r.owner_email,
      gymName: r.gym_name,
      athleteName: r.athlete_full_name,
      stage,
      dueDate,
      amountAed: r.monthly_price_aed ?? 0,
    })

    if (sendError) {
      errors.push(`send ${r.id}: ${sendError}`)
      continue
    }

    if (resendId && inserted?.id) {
      await supabase.from('billing_reminders').update({ resend_id: resendId }).eq('id', inserted.id)
    }
    sent++
  }

  return NextResponse.json({ processed, sent, skipped, errors })
}
