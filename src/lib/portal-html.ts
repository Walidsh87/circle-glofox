// Standalone branded page for /portal/[token] failure states. The success
// path 302-redirects into the PSP-hosted portal and never renders this.

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function portalErrorHtml(title: string, message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)} — Circle</title>
</head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#F6F4ED;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;padding:24px">
<div style="max-width:420px;background:#FFFFFF;border:1px solid #E3DFD2;border-radius:14px;padding:32px 28px;text-align:center">
<div style="width:36px;height:36px;border-radius:50%;border:4px solid #C8F135;margin:0 auto 16px"></div>
<h1 style="font-size:19px;font-weight:600;color:#15150F;margin:0 0 8px">${esc(title)}</h1>
<p style="font-size:14px;line-height:1.6;color:#6B6757;margin:0">${esc(message)}</p>
</div>
</body>
</html>`
}
