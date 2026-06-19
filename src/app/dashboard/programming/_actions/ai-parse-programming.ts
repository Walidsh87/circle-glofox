'use server'

import { requireProgrammingAction } from '@/lib/auth/action-guards'
import Anthropic from '@anthropic-ai/sdk'
import { env } from '@/env'
import { checkActionRateLimit } from '@/lib/rate-limit'
import { buildParsePrompt, extractBlockText } from '../_lib/ai-prompt'

const TOO_OFTEN = "You're doing that too often. Please wait a minute and try again."

const MAX_INPUT = 8000

export async function aiParseProgramming(freeform: string): Promise<{ error: string | null; text: string | null }> {
  const input = (freeform ?? '').trim()
  if (!input) return { error: 'Paste some programming to parse.', text: null }
  if (input.length > MAX_INPUT) return { error: "That's too long to parse at once — try a week or two.", text: null }

  const auth = await requireProgrammingAction('Only owners and coaches can use the AI parser.')
  if ('error' in auth) return { error: auth.error, text: null }

  // Per-user throttle: this calls the paid Anthropic API, so cap a runaway loop.
  if (!(await checkActionRateLimit(`ai:${auth.user.id}`))) return { error: TOO_OFTEN, text: null }

  if (!env.ANTHROPIC_API_KEY) return { error: "AI parsing isn't configured yet.", text: null }

  const { system, user: userMsg } = buildParsePrompt(input)
  try {
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      temperature: 0.2,
      system,
      messages: [{ role: 'user', content: userMsg }],
    })
    const raw = msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('\n')
    const text = extractBlockText(raw)
    if (!text) return { error: "The AI couldn't structure that — try rephrasing.", text: null }
    return { error: null, text }
  } catch (e) {
    console.error('[ai-parse] Anthropic call failed:', e)
    return { error: 'The AI parser is unavailable right now. Try again.', text: null }
  }
}
