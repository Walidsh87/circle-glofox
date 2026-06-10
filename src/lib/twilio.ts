import twilio from 'twilio'
import { env } from '@/env'

export function smsConfigured(): boolean {
  return !!(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_SMS_FROM)
}

export async function sendSms(input: { to: string; body: string; statusCallback?: string }): Promise<{ sid: string | null; status: string | null; error: string | null }> {
  if (!smsConfigured()) return { sid: null, status: null, error: 'SMS not configured' }
  try {
    const client = twilio(env.TWILIO_ACCOUNT_SID!, env.TWILIO_AUTH_TOKEN!)
    const msg = await client.messages.create({
      to: input.to,
      from: env.TWILIO_SMS_FROM!,
      body: input.body,
      ...(input.statusCallback ? { statusCallback: input.statusCallback } : {}),
    })
    return { sid: msg.sid, status: msg.status, error: null }
  } catch (e) {
    return { sid: null, status: null, error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

export function waConfigured(): boolean {
  return !!(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_WHATSAPP_FROM)
}

export async function sendWhatsApp(input: { to: string; contentSid: string; contentVariables: Record<string, string>; statusCallback?: string }): Promise<{ sid: string | null; status: string | null; error: string | null }> {
  if (!waConfigured()) return { sid: null, status: null, error: 'WhatsApp not configured' }
  try {
    const client = twilio(env.TWILIO_ACCOUNT_SID!, env.TWILIO_AUTH_TOKEN!)
    const msg = await client.messages.create({
      to: `whatsapp:${input.to}`,
      from: `whatsapp:${env.TWILIO_WHATSAPP_FROM!}`,
      contentSid: input.contentSid,
      contentVariables: JSON.stringify(input.contentVariables),
      ...(input.statusCallback ? { statusCallback: input.statusCallback } : {}),
    })
    return { sid: msg.sid, status: msg.status, error: null }
  } catch (e) {
    return { sid: null, status: null, error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

export async function sendWhatsAppText(input: { to: string; body: string }): Promise<{ sid: string | null; error: string | null }> {
  if (!waConfigured()) return { sid: null, error: 'WhatsApp not configured' }
  try {
    const client = twilio(env.TWILIO_ACCOUNT_SID!, env.TWILIO_AUTH_TOKEN!)
    const msg = await client.messages.create({
      to: `whatsapp:${input.to}`,
      from: `whatsapp:${env.TWILIO_WHATSAPP_FROM!}`,
      body: input.body,
    })
    return { sid: msg.sid, error: null }
  } catch (e) {
    return { sid: null, error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

export function verifyTwilioSignature(signature: string, url: string, params: Record<string, string>): boolean {
  if (!env.TWILIO_AUTH_TOKEN) return false
  try {
    return twilio.validateRequest(env.TWILIO_AUTH_TOKEN, signature, url, params)
  } catch {
    return false
  }
}
