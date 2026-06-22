// Movement video library (#82): pure helpers. No Supabase (coverage-gated).
// SECURITY: only YouTube/Vimeo may ever become an iframe src — matched by EXACT
// hostname equality (never substring), with a strict id shape. Anything else → null.

const YT_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com'])
const YT_ID = /^[A-Za-z0-9_-]{11}$/
const VIMEO_ID = /^[0-9]+$/

export function toEmbedUrl(raw: string): { provider: 'youtube' | 'vimeo'; embedUrl: string } | null {
  let u: URL
  try { u = new URL(raw.trim()) } catch { return null }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null // reject javascript:/data:
  const host = u.hostname.toLowerCase()

  if (host === 'youtu.be') {
    const id = u.pathname.split('/').filter(Boolean)[0] ?? ''
    return YT_ID.test(id) ? { provider: 'youtube', embedUrl: `https://www.youtube-nocookie.com/embed/${id}` } : null
  }
  if (YT_HOSTS.has(host)) {
    let id = ''
    if (u.pathname === '/watch') id = u.searchParams.get('v') ?? ''
    else if (u.pathname.startsWith('/embed/')) id = u.pathname.slice('/embed/'.length).split('/')[0]
    else if (u.pathname.startsWith('/shorts/')) id = u.pathname.slice('/shorts/'.length).split('/')[0]
    else if (u.pathname.startsWith('/v/')) id = u.pathname.slice('/v/'.length).split('/')[0]
    return YT_ID.test(id) ? { provider: 'youtube', embedUrl: `https://www.youtube-nocookie.com/embed/${id}` } : null
  }
  if (host === 'vimeo.com' || host === 'www.vimeo.com') {
    const id = u.pathname.split('/').filter(Boolean)[0] ?? ''
    return VIMEO_ID.test(id) ? { provider: 'vimeo', embedUrl: `https://player.vimeo.com/video/${id}` } : null
  }
  if (host === 'player.vimeo.com') {
    const parts = u.pathname.split('/').filter(Boolean) // ['video','123']
    const id = parts[0] === 'video' ? (parts[1] ?? '') : ''
    return VIMEO_ID.test(id) ? { provider: 'vimeo', embedUrl: `https://player.vimeo.com/video/${id}` } : null
  }
  return null
}

export function movementSlug(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
}

export function validateMovementVideo(input: { slug: string; label: string; url: string }): string | null {
  if (!input.label || !input.label.trim()) return 'Give the movement a name.'
  if (input.label.trim().length > 80) return 'Name is too long (max 80 characters).'
  if (!/^[a-z0-9_-]{1,60}$/.test(input.slug)) return 'Invalid movement.'
  if (!toEmbedUrl(input.url)) return 'Use a YouTube or Vimeo link.'
  return null
}
