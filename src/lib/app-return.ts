// Deep-link targets the mobile checkout bounce page may redirect to. The app sends its own
// runtime return URL (Expo Go = exp://<dev-host>/--/checkout-return, standalone builds =
// circlefitness://checkout-return) because the scheme differs per environment. Only custom
// app schemes pass — never http(s) — so the bounce page cannot become an open redirect.

export const DEFAULT_APP_RETURN = 'circlefitness://checkout-return'

const ALLOWED = [
  /^circlefitness:\/\/checkout-return$/,
  // Expo Go / dev-client: exp(s)://host[:port][/path]/--/checkout-return (no query/fragment)
  /^exps?:\/\/[A-Za-z0-9.\-:_/[\]]+\/--\/checkout-return$/,
]

/** Validate an app-supplied return target; anything unexpected falls back to the standalone scheme. */
export function resolveAppTarget(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length > 300) return DEFAULT_APP_RETURN
  return ALLOWED.some((re) => re.test(raw)) ? raw : DEFAULT_APP_RETURN
}
