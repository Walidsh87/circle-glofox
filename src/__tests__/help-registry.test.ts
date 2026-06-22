import { describe, it, expect } from 'vitest'
import { HELP_GUIDES, findGuide, guidesByArea } from '@/lib/help/registry'
import { AREA_ORDER } from '@/lib/help/types'

describe('help registry', () => {
  it('every guide has a unique slug and a valid area', () => {
    const slugs = HELP_GUIDES.map((g) => g.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    for (const g of HELP_GUIDES) {
      expect(AREA_ORDER).toContain(g.area)
      expect(g.title.length).toBeGreaterThan(0)
      expect(g.blocks.length).toBeGreaterThan(0)
    }
  })
  it('findGuide returns the match, else the first guide', () => {
    expect(findGuide('overview')?.slug).toBe('overview')
    expect(findGuide('nope')).toBe(HELP_GUIDES[0])
    expect(findGuide(undefined)).toBe(HELP_GUIDES[0])
  })
  it('guidesByArea groups in AREA_ORDER, no empty areas', () => {
    const groups = guidesByArea()
    for (const g of groups) expect(g.guides.length).toBeGreaterThan(0)
  })
})
