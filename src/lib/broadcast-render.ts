export function firstNameOf(fullName: string): string {
  const first = (fullName ?? '').trim().split(/\s+/)[0]
  return first || 'there'
}

export function renderBroadcastBody(
  body: string,
  ctx: { firstName: string; gymName: string; unsubscribeUrl: string },
): string {
  const personalized = body.split('{{first_name}}').join(ctx.firstName)
  return `${personalized}
<hr style="border:none;border-top:1px solid #eee;margin:24px 0" />
<p style="font-size:12px;color:#888">— ${ctx.gymName}<br />
<a href="${ctx.unsubscribeUrl}">Unsubscribe</a> from these emails.</p>`
}
