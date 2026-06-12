import { renderBlocks, type Block } from './email-blocks'
import { emailShell } from './email-shell'

export function firstNameOf(fullName: string): string {
  const first = (fullName ?? '').trim().split(/\s+/)[0]
  return first || 'there'
}

function footer(gymName: string, unsubscribeUrl: string): string {
  return `
<hr style="border:none;border-top:1px solid #E3DFD2;margin:24px 0" />
<p style="font-size:12px;color:#8A8674">— ${gymName}<br />
<a href="${unsubscribeUrl}" style="color:#5C7A00">Unsubscribe</a> from these emails.</p>`
}

export function renderBroadcastBody(
  body: string,
  ctx: { firstName: string; gymName: string; unsubscribeUrl: string },
): string {
  const personalized = body.split('{{first_name}}').join(ctx.firstName)
  return `${personalized}${footer(ctx.gymName, ctx.unsubscribeUrl)}`
}

export function renderEmail(input: {
  blocks: Block[] | null
  plainBody: string
  ctx: { firstName: string; gymName: string; unsubscribeUrl: string }
}): string {
  const { blocks, plainBody, ctx } = input
  const inner = blocks && blocks.length
    ? renderBlocks(blocks, { firstName: ctx.firstName })
    : plainBody.split('{{first_name}}').join(ctx.firstName)
  return emailShell(`${inner}${footer(ctx.gymName, ctx.unsubscribeUrl)}`)
}
