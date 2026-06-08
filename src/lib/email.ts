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

export type CardFailedEmailInput = {
  to: string
  gymName: string
  athleteName: string
  amountAed: number
  attemptCount: number
  maxRetries: number
  updatePaymentUrl: string
}

export async function sendCardFailedEmail(
  input: CardFailedEmailInput
): Promise<{ id: string | null; error: string | null }> {
  const { athleteName, gymName, amountAed, attemptCount, maxRetries, updatePaymentUrl, to } = input
  const amount = `${amountAed.toLocaleString()} AED`
  const isFinal = attemptCount >= maxRetries

  const subject = isFinal
    ? `Action required — ${gymName} payment failed`
    : `Heads up — ${gymName} payment couldn't be processed`

  const body = isFinal
    ? `<p>Hi ${athleteName},</p>
<p>We tried ${attemptCount} times to charge ${amount} for your <strong>${gymName}</strong> membership and your card was declined each time. Your account is now <strong>past due</strong>, which means your check-ins may be blocked.</p>
<p><a href="${updatePaymentUrl}" style="display:inline-block;padding:12px 20px;background:#111;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">Update your card</a></p>
<p>Once you update your card, we'll automatically retry the charge.</p>
<p>— ${gymName}</p>`
    : `<p>Hi ${athleteName},</p>
<p>We tried to charge ${amount} for your <strong>${gymName}</strong> membership but your card was declined (attempt ${attemptCount} of ${maxRetries}). We'll retry automatically, but updating your card now will speed things up.</p>
<p><a href="${updatePaymentUrl}" style="display:inline-block;padding:12px 20px;background:#111;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">Update payment method</a></p>
<p>— ${gymName}</p>`

  try {
    const { data, error } = await resend.emails.send({
      from: env.RESEND_FROM_EMAIL,
      to,
      subject,
      html: body,
    })
    if (error) return { id: null, error: error.message }
    return { id: data?.id ?? null, error: null }
  } catch (e) {
    return { id: null, error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

export type WaitlistEmailInput = {
  to: string
  athleteName: string
  className: string
  classTime: string
  gymName: string
  bookUrl: string
}

export async function sendWaitlistEmail(
  input: WaitlistEmailInput
): Promise<{ id: string | null; error: string | null }> {
  const body = `<p>Hi ${input.athleteName},</p>
<p>A spot just opened in <strong>${input.className}</strong> (${input.classTime}) at ${input.gymName}. Spots go fast — book now:</p>
<p><a href="${input.bookUrl}" style="display:inline-block;padding:12px 20px;background:#111;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">Book now</a></p>
<p>— ${input.gymName}</p>`
  try {
    const { data, error } = await resend.emails.send({
      from: env.RESEND_FROM_EMAIL,
      to: input.to,
      subject: `A spot opened in ${input.className} at ${input.gymName}`,
      html: body,
    })
    if (error) return { id: null, error: error.message }
    return { id: data?.id ?? null, error: null }
  } catch (e) {
    return { id: null, error: e instanceof Error ? e.message : 'Unknown error' }
  }
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
