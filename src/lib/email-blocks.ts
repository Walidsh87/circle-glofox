export type Block =
  | { type: 'heading'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'image'; url: string; alt: string }
  | { type: 'button'; label: string; url: string }
  | { type: 'divider' }

export const MAX_BLOCKS = 50

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function isHttpUrl(s: string): boolean {
  return /^https?:\/\/.+/i.test((s ?? '').trim())
}

export function renderBlocks(blocks: Block[], ctx: { firstName: string }): string {
  const tok = (s: string) => esc(s.split('{{first_name}}').join(ctx.firstName))
  return blocks.map((b) => {
    switch (b.type) {
      case 'heading': return `<h2 style="font-size:22px;font-weight:700;margin:0 0 12px;color:#111">${tok(b.text)}</h2>`
      case 'paragraph': return `<p style="font-size:15px;line-height:1.5;margin:0 0 12px;color:#333">${tok(b.text)}</p>`
      case 'image': return `<img src="${esc(b.url)}" alt="${esc(b.alt)}" style="max-width:100%;height:auto;display:block;margin:0 0 12px;border-radius:8px" />`
      case 'button': return `<table cellpadding="0" cellspacing="0" style="margin:0 0 16px"><tr><td style="border-radius:8px;background:#111"><a href="${esc(b.url)}" style="display:inline-block;padding:12px 22px;color:#fff;text-decoration:none;font-weight:600;font-size:15px">${esc(b.label)}</a></td></tr></table>`
      case 'divider': return `<hr style="border:none;border-top:1px solid #eee;margin:16px 0" />`
    }
  }).join('\n')
}

export function validateBlocks(blocks: Block[]): string | null {
  if (!Array.isArray(blocks) || blocks.length === 0) return 'Add at least one content block.'
  if (blocks.length > MAX_BLOCKS) return `A campaign can have at most ${MAX_BLOCKS} blocks.`
  for (const b of blocks) {
    if (b.type === 'heading' || b.type === 'paragraph') {
      if (!b.text || !b.text.trim()) return 'Heading and text blocks cannot be empty.'
    } else if (b.type === 'image') {
      if (!isHttpUrl(b.url)) return 'Image blocks need a valid http(s) URL.'
    } else if (b.type === 'button') {
      if (!b.label || !b.label.trim()) return 'Button blocks need a label.'
      if (!isHttpUrl(b.url)) return 'Button blocks need a valid http(s) link.'
    }
  }
  return null
}

export function flattenBlocks(blocks: Block[]): string {
  return blocks
    .map((b) => (b.type === 'heading' || b.type === 'paragraph' ? b.text : b.type === 'button' ? b.label : ''))
    .filter(Boolean)
    .join('\n\n')
}
