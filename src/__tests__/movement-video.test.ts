import { describe, it, expect } from 'vitest'
import { toEmbedUrl, validateMovementVideo, movementSlug } from '@/lib/movement-video'

describe('toEmbedUrl — accepts YouTube', () => {
  const yt = { provider: 'youtube' as const, embedUrl: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ' }
  it('watch?v=', () => expect(toEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toEqual(yt))
  it('watch with extra params', () => expect(toEmbedUrl('https://youtube.com/watch?v=dQw4w9WgXcQ&t=30s')).toEqual(yt))
  it('youtu.be', () => expect(toEmbedUrl('https://youtu.be/dQw4w9WgXcQ')).toEqual(yt))
  it('shorts', () => expect(toEmbedUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toEqual(yt))
  it('embed', () => expect(toEmbedUrl('https://www.youtube.com/embed/dQw4w9WgXcQ')).toEqual(yt))
  it('nocookie embed', () => expect(toEmbedUrl('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')).toEqual(yt))
})

describe('toEmbedUrl — accepts Vimeo', () => {
  const vm = { provider: 'vimeo' as const, embedUrl: 'https://player.vimeo.com/video/123456789' }
  it('vimeo.com/<id>', () => expect(toEmbedUrl('https://vimeo.com/123456789')).toEqual(vm))
  it('player.vimeo.com/video/<id>', () => expect(toEmbedUrl('https://player.vimeo.com/video/123456789')).toEqual(vm))
})

describe('toEmbedUrl — rejects everything else (security)', () => {
  it('arbitrary host', () => expect(toEmbedUrl('https://evil.com/watch?v=dQw4w9WgXcQ')).toBeNull())
  it('host look-alike suffix', () => expect(toEmbedUrl('https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ')).toBeNull())
  it('host in path only', () => expect(toEmbedUrl('https://evil.com/youtube.com/watch?v=dQw4w9WgXcQ')).toBeNull())
  it('javascript: scheme', () => expect(toEmbedUrl('javascript:alert(1)')).toBeNull())
  it('data: scheme', () => expect(toEmbedUrl('data:text/html,<script>alert(1)</script>')).toBeNull())
  it('not a url', () => expect(toEmbedUrl('not a url')).toBeNull())
  it('youtube with bad id', () => expect(toEmbedUrl('https://www.youtube.com/watch?v=tooShort')).toBeNull())
  it('youtube watch with no id', () => expect(toEmbedUrl('https://www.youtube.com/watch')).toBeNull())
  it('vimeo with non-numeric id', () => expect(toEmbedUrl('https://vimeo.com/abcdef')).toBeNull())
  it('empty', () => expect(toEmbedUrl('')).toBeNull())
})

describe('validateMovementVideo', () => {
  const ok = { slug: 'back_squat', label: 'Back Squat', url: 'https://youtu.be/dQw4w9WgXcQ' }
  it('accepts a valid entry', () => expect(validateMovementVideo(ok)).toBeNull())
  it('rejects an empty label', () => expect(validateMovementVideo({ ...ok, label: '  ' })).not.toBeNull())
  it('rejects a non-video url', () => expect(validateMovementVideo({ ...ok, url: 'https://evil.com/x' })).toMatch(/YouTube or Vimeo/))
  it('rejects a bad slug', () => expect(validateMovementVideo({ ...ok, slug: 'Bad Slug!' })).not.toBeNull())
})

describe('movementSlug', () => {
  it('normalizes free text', () => expect(movementSlug('Double Unders!')).toBe('double-unders'))
  it('collapses + trims separators', () => expect(movementSlug('  Wall  ball / shot ')).toBe('wall-ball-shot'))
})
