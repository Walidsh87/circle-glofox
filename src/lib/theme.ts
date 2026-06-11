export type Theme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'circle-theme'

/**
 * Resolution chain per spec §4: localStorage -> system preference -> light.
 * (matchMedia('(prefers-color-scheme: dark)') is false for both "light" and
 * "no preference", so the final fallback to light is implicit.)
 */
export function resolveTheme(stored: string | null, systemPrefersDark: boolean): Theme {
  if (stored === 'light' || stored === 'dark') return stored
  return systemPrefersDark ? 'dark' : 'light'
}

/**
 * Inline pre-paint script — mirrors resolveTheme(). Injected as the first
 * child of <body> in the root layout so the resolved theme is applied before
 * first paint. On error (e.g. localStorage blocked) the SSR default
 * (data-theme="dark" on <html>) is left in place.
 */
export const themeInitScript = `(function(){try{var s=localStorage.getItem('${THEME_STORAGE_KEY}');var d=window.matchMedia('(prefers-color-scheme: dark)').matches;var t=(s==='light'||s==='dark')?s:(d?'dark':'light');document.documentElement.setAttribute('data-theme',t);}catch(e){}})()`
