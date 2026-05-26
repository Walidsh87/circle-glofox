import { Resend } from 'resend'
import { env } from '@/env'
import type { ReminderStage } from '@/lib/billing-reminders'

const resend = new Resend(env.RESEND_API_KEY)

export type ReminderEmailInput = {
  to: string
  bcc?: string | null
  gymName: string
  athleteName: string
  stage: ReminderStage
  dueDate: string
  amountAed: number
}

function formatDate(iso: string): string {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function buildSubject(stage: ReminderStage, gymName: string, dueDate: string): string {
  if (stage === 'pre') return `Your ${gymName} membership is due ${formatDate(dueDate)}`
  if (stage === 'due') return `Membership due today — ${gymName}`
  return `Payment overdue — ${gymName}`
}

function buildBody(input: ReminderEmailInput): string {
  const { athleteName, gymName, stage, dueDate, amountAed } = input
  const date = formatDate(dueDate)
  const amount = `${amountAed.toLocaleString()} AED`

  if (stage === 'pre') {
    return `<p>Hey ${athleteName},</p>
<p>Just a heads-up — your monthly membership at <strong>${gymName}</strong> is due on <strong>${date}</strong> (${amount}). Drop by the front desk anytime to renew.</p>
<p>— ${gymName}</p>`
  }

  if (stage === 'due') {
    return `<p>Hi ${athleteName},</p>
<p>Your monthly membership at <strong>${gymName}</strong> is due today (${amount}). Please renew at the front desk or contact us.</p>
<p>— ${gymName}</p>`
  }

  return `<p>Hi ${athleteName},</p>
<p>Your <strong>${gymName}</strong> membership payment is 3 days overdue (${amount}). Your gym check-ins may be blocked until you renew. Please drop by or contact us today.</p>
<p>— ${gymName}</p>`
}

export async function sendBillingReminderEmail(
  input: ReminderEmailInput
): Promise<{ id: string | null; error: string | null }> {
  try {
    const { data, error } = await resend.emails.send({
      from: env.RESEND_FROM_EMAIL,
      to: input.to,
      bcc: input.stage === 'overdue' && input.bcc ? [input.bcc] : undefined,
      subject: buildSubject(input.stage, input.gymName, input.dueDate),
      html: buildBody(input),
    })

    if (error) return { id: null, error: error.message }
    return { id: data?.id ?? null, error: null }
  } catch (e) {
    return { id: null, error: e instanceof Error ? e.message : 'Unknown error' }
  }
}
