import { en } from './en'
import { ar } from './ar'

export const LOCALES = ['en', 'ar'] as const
export type Locale = (typeof LOCALES)[number]
export type Messages = typeof en

const dictionaries: Record<Locale, Messages> = { en, ar }

export function resolveLocale(raw: string | null | undefined): Locale {
  return raw === 'ar' ? 'ar' : 'en'
}

export function getDictionary(locale: Locale): Messages {
  return dictionaries[locale]
}

function lookup(messages: Messages, key: string): string {
  const v = key.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), messages)
  return typeof v === 'string' ? v : key
}

function interpolate(str: string, vars?: Record<string, string | number>): string {
  return vars ? str.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`)) : str
}

export type TFn = (key: string, vars?: Record<string, string | number>) => string

export function makeT(messages: Messages): TFn {
  return (key, vars) => interpolate(lookup(messages, key), vars)
}

export function getT(locale: Locale): TFn {
  return makeT(getDictionary(locale))
}
