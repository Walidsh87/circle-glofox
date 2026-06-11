// Role tiers (#57). Keep in sync with the SQL helpers in migrations/058.
export type Role = 'owner' | 'admin' | 'coach' | 'receptionist' | 'athlete'

export const MANAGER_ROLES = ['owner', 'admin'] as const
export const PROGRAMMING_ROLES = ['owner', 'admin', 'coach'] as const
export const ALL_STAFF_ROLES = ['owner', 'admin', 'coach', 'receptionist'] as const
