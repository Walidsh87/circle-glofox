import { Resend } from 'resend'
import { env } from '@/env'
import { emailShell, emailButton } from './email-shell'
import { getT, type Locale, type TFn } from '@/lib/i18n'
import type { ReminderStage } from '@/lib/billing-reminders'

const resend = new Resend(env.RESEND_API_KEY)

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export type ReminderEmailInput = {
  to: string
  bcc?: string | null
  gymName: string
  athleteName: string
  stage: ReminderStage
  dueDate: string
  amountAed: number
  locale: Locale
}

function formatDate(iso: string): string {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function buildSubject(t: TFn, stage: ReminderStage, gymName: string, dueDate: string): string {
  return t(`comms.billing.subject.${stage}`, { gymName, date: formatDate(dueDate) })
}

function buildBody(t: TFn, input: ReminderEmailInput): string {
  const amount = `${input.amountAed.toLocaleString()} AED`
  return t(`comms.billing.body.${input.stage}`, {
    athleteName: input.athleteName, gymName: input.gymName, date: formatDate(input.dueDate), amount,
  })
}

export type CardFailedEmailInput = {
  to: string
  gymName: string
  athleteName: string
  amountAed: number
  attemptCount: number
  maxRetries: number
  updatePaymentUrl: string
  locale: Locale
}

export async function sendCardFailedEmail(
  input: CardFailedEmailInput
): Promise<{ id: string | null; error: string | null }> {
  const { athleteName, gymName, amountAed, attemptCount, maxRetries, updatePaymentUrl, to, locale } = input
  const t = getT(locale)
  const amount = `${amountAed.toLocaleString()} AED`
  const variant = attemptCount >= maxRetries ? 'final' : 'retry'
  const button = emailButton(t(`comms.cardFailed.cta.${variant}`), updatePaymentUrl)
  const subject = t(`comms.cardFailed.subject.${variant}`, { gymName })
  const body = t(`comms.cardFailed.body.${variant}`, { athleteName, gymName, amount, attemptCount, maxRetries, button })

  try {
    const { data, error } = await resend.emails.send({
      from: env.RESEND_FROM_EMAIL,
      to,
      subject,
      html: emailShell(body, locale),
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
  locale: Locale
}

export async function sendWaitlistEmail(
  input: WaitlistEmailInput
): Promise<{ id: string | null; error: string | null }> {
  const t = getT(input.locale)
  const button = emailButton(t('comms.waitlist.cta'), input.bookUrl)
  const body = t('comms.waitlist.body', { athleteName: input.athleteName, className: input.className, classTime: input.classTime, gymName: input.gymName, button })
  const subject = t('comms.waitlist.subject', { className: input.className, gymName: input.gymName })
  try {
    const { data, error } = await resend.emails.send({
      from: env.RESEND_FROM_EMAIL,
      to: input.to,
      subject,
      html: emailShell(body, input.locale),
    })
    if (error) return { id: null, error: error.message }
    return { id: data?.id ?? null, error: null }
  } catch (e) {
    return { id: null, error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

export type BroadcastMessage = { to: string; subject: string; html: string }

export async function sendBroadcastEmails(
  messages: BroadcastMessage[]
): Promise<{ ok: boolean; error: string | null; ids: (string | null)[] }> {
  if (messages.length === 0) return { ok: true, error: null, ids: [] }
  try {
    const { data, error } = await resend.batch.send(
      messages.map((m) => ({ from: env.RESEND_FROM_EMAIL, to: m.to, subject: m.subject, html: m.html }))
    )
    if (error) return { ok: false, error: error.message, ids: [] }
    const ids = (data?.data ?? []).map((d: { id: string }) => d.id ?? null)
    return { ok: true, error: null, ids }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error', ids: [] }
  }
}

export async function sendBillingReminderEmail(
  input: ReminderEmailInput
): Promise<{ id: string | null; error: string | null }> {
  const t = getT(input.locale)
  try {
    const { data, error } = await resend.emails.send({
      from: env.RESEND_FROM_EMAIL,
      to: input.to,
      bcc: input.stage === 'overdue' && input.bcc ? [input.bcc] : undefined,
      subject: buildSubject(t, input.stage, input.gymName, input.dueDate),
      html: emailShell(buildBody(t, input), input.locale),
    })

    if (error) return { id: null, error: error.message }
    return { id: data?.id ?? null, error: null }
  } catch (e) {
    return { id: null, error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

export type QuoteEmailInput = {
  to: string
  buyerName: string
  gymName: string
  quoteTitle: string
  quoteNumber: string
  totalAed: number
  quoteUrl: string
}

export function buildQuoteEmail(input: QuoteEmailInput): { subject: string; html: string } {
  const button = emailButton('View your quote', input.quoteUrl)
  const body = `<p>Hi ${escapeHtml(input.buyerName)},</p>
<p><strong>${escapeHtml(input.gymName)}</strong> has prepared a quote for you — <strong>${escapeHtml(input.quoteTitle)}</strong> (${escapeHtml(input.quoteNumber)}), total <strong>AED ${input.totalAed.toFixed(2)}</strong>.</p>
<p>Review the details, accept, and pay securely online:</p>
${button}
<p>— ${escapeHtml(input.gymName)}</p>`
  return {
    subject: `Your quote from ${input.gymName} — ${input.quoteNumber}`,
    html: emailShell(body, 'en'),
  }
}

export async function sendQuoteEmail(
  input: QuoteEmailInput,
): Promise<{ id: string | null; error: string | null }> {
  const { subject, html } = buildQuoteEmail(input)
  try {
    const { data, error } = await resend.emails.send({
      from: env.RESEND_FROM_EMAIL,
      to: input.to,
      subject,
      html,
    })
    if (error) return { id: null, error: error.message }
    return { id: data?.id ?? null, error: null }
  } catch (e) {
    return { id: null, error: e instanceof Error ? e.message : 'Unknown error' }
  }
}
