// Light-palette literals for outbound email (emails can't read CSS variables;
// values mirror the [data-theme='light'] tokens in globals.css).

import type { Locale } from '@/lib/i18n'

const FONT = "-apple-system,'Segoe UI',Helvetica,Arial,sans-serif"

export function emailButton(label: string, url: string): string {
  return `<table cellpadding="0" cellspacing="0" style="margin:0 0 16px"><tr><td style="border-radius:8px;background:#C8F135"><a href="${url}" style="display:inline-block;padding:12px 22px;color:#15150F;text-decoration:none;font-weight:600;font-size:15px">${label}</a></td></tr></table>`
}

export function emailShell(inner: string, locale: Locale = 'en'): string {
  const dir = locale === 'ar' ? 'rtl' : 'ltr'
  const align = locale === 'ar' ? 'right' : 'left'
  return `<!DOCTYPE html>
<html dir="${dir}">
<body style="margin:0;padding:0;background:#F6F4ED">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6F4ED"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border:1px solid #E3DFD2;border-radius:12px"><tr><td style="padding:32px 28px;font-family:${FONT};font-size:15px;line-height:1.6;color:#15150F;direction:${dir};text-align:${align}">
${inner}
</td></tr></table>
</td></tr></table>
</body>
</html>`
}
