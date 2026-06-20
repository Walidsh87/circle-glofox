export function toSlug(name: string) {
  return name.toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 40)
}

/** Slugs that collide with app routes — rejected on both the client form and every server action.
 *  'join' protects the public /join/[gymSlug] member-onboarding route. */
export const RESERVED_SLUGS = [
  'dashboard', 'onboarding', 'auth', 'api', 'login', 'signup', 'admin', 'settings', 'join',
]
