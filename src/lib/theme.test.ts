import { describe, it, expect } from 'vitest'
import { resolveTheme, themeInitScript, THEME_STORAGE_KEY } from './theme'

describe('resolveTheme', () => {
  it('honors a stored light preference', () => {
    expect(resolveTheme('light', true)).toBe('light')
  })

  it('honors a stored dark preference', () => {
    expect(resolveTheme('dark', false)).toBe('dark')
  })

  it('falls back to system preference when nothing stored', () => {
    expect(resolveTheme(null, true)).toBe('dark')
    expect(resolveTheme(null, false)).toBe('light')
  })

  it('ignores junk stored values and uses system preference', () => {
    expect(resolveTheme('banana', true)).toBe('dark')
    expect(resolveTheme('', false)).toBe('light')
  })
})

describe('themeInitScript', () => {
  it('reads the canonical storage key and sets data-theme', () => {
    expect(THEME_STORAGE_KEY).toBe('circle-theme')
    expect(themeInitScript).toContain(THEME_STORAGE_KEY)
    expect(themeInitScript).toContain('data-theme')
    expect(themeInitScript).toContain('prefers-color-scheme: dark')
  })
})
