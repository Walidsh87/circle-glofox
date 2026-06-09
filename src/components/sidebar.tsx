'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { CircleMark } from '@/components/circle-mark'

type NavItem = {
  key: string
  label: string
  href: string
  icon: string
  badge?: string
  badgeVariant?: 'lime' | 'danger'
}

type NavGroup = {
  section: string
  items: NavItem[]
}

function getNavGroups(role: string): NavGroup[] {
  const isOwner = role === 'owner'
  const isStaff = role === 'owner' || role === 'coach'

  const groups: NavGroup[] = []

  const runTheGym: NavItem[] = [
    { key: 'dashboard', label: 'Dashboard', href: '/dashboard', icon: 'home' },
  ]
  if (isOwner) runTheGym.push({ key: 'kpi', label: 'Metrics', href: '/dashboard/kpi', icon: 'chart' })
  if (isStaff) runTheGym.push({ key: 'retention', label: 'Retention', href: '/dashboard/retention', icon: 'activity' })
  if (isOwner) runTheGym.push({ key: 'members', label: 'Member directory', href: '/dashboard/members', icon: 'users' })
  if (isOwner) runTheGym.push({ key: 'waivers', label: 'Waivers', href: '/dashboard/waivers', icon: 'shield' })
  if (isOwner) runTheGym.push({ key: 'payments', label: 'Payments', href: '/dashboard/payments', icon: 'card' })
  if (isOwner) runTheGym.push({ key: 'packages', label: 'Packages', href: '/dashboard/packages', icon: 'tag' })
  if (isOwner) runTheGym.push({ key: 'settings', label: 'Settings', href: '/dashboard/settings', icon: 'settings' })
  groups.push({ section: 'Run the gym', items: runTheGym })

  if (isStaff) {
    groups.push({
      section: 'Programming',
      items: [
        { key: 'prep', label: 'Class prep', href: '/dashboard/prep', icon: 'users' },
        { key: 'classes', label: 'Class schedule', href: '/dashboard/classes', icon: 'calendar' },
        { key: 'wod', label: 'Daily WOD', href: '/dashboard/wod', icon: 'flame' },
        { key: 'programming', label: 'WOD Planner', href: '/dashboard/programming', icon: 'calendar' },
        { key: 'whiteboard', label: 'Whiteboard', href: '/dashboard/whiteboard', icon: 'monitor', badge: 'live', badgeVariant: 'lime' },
      ],
    })
  }

  const athleteItems: NavItem[] = []
  if (!isStaff) athleteItems.push({ key: 'wod', label: 'Daily WOD', href: '/dashboard/wod', icon: 'flame' })
  athleteItems.push({ key: 'schedule', label: 'Book a class', href: '/dashboard/schedule', icon: 'book' })
  athleteItems.push({ key: 'timer', label: 'Timer', href: '/dashboard/timer', icon: 'clock' })
  if (!isStaff) athleteItems.push({ key: 'shop', label: 'Buy a pack', href: '/dashboard/shop', icon: 'tag' })
  athleteItems.push({ key: 'lifts', label: 'My 1RMs', href: '/dashboard/lifts', icon: 'barbell' })
  athleteItems.push({ key: 'skills', label: 'Skills', href: '/dashboard/skills', icon: 'medal' })
  athleteItems.push({ key: 'feed', label: 'Activity Feed', href: '/dashboard/feed', icon: 'activity' })
  athleteItems.push({ key: 'committed-club', label: 'Committed Club', href: '/dashboard/committed-club', icon: 'trophy' })
  athleteItems.push({ key: 'profile', label: 'My Profile', href: '/dashboard/profile', icon: 'person' })
  groups.push({ section: 'Athletes', items: athleteItems })

  return groups
}

function initials(name: string) {
  return name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
}

const ICON_PATHS: Record<string, React.ReactNode> = {
  home: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V20h14V9.5" /></>,
  users: <><circle cx="9" cy="8" r="3.2" /><path d="M3 19c0-3.3 2.7-6 6-6s6 2.7 6 6" /><circle cx="17" cy="9" r="2.5" /><path d="M15 19c0-2.5 1.8-4.5 4-4.5" /></>,
  card: <><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10.5h18M7 15.5h3" /></>,
  calendar: <><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 9.5h17M8 3v4M16 3v4" /></>,
  flame: <><path d="M12 3c2 4 5 5 5 9a5 5 0 1 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-8z" /></>,
  activity: <><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></>,
  monitor: <><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M9 20h6M12 17v3" /></>,
  book: <><path d="M4 5h7v15H4zM13 5h7v15h-7z" /><path d="M4 5c0-1 1-2 2.5-2H11M20 5c0-1-1-2-2.5-2H13" /></>,
  barbell: <><path d="M3 12h2M19 12h2M6 8v8M8 8v8M16 8v8M18 8v8M8 12h8" /></>,
  person: <><circle cx="12" cy="8" r="3.5" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>,
  shield: <><path d="M12 3L4 7v5c0 5.5 4.5 9.7 8 11 3.5-1.3 8-5.5 8-11V7l-8-4z" /></>,
  tag: <><path d="M3 11V4a1 1 0 0 1 1-1h7l9 9-8 8-9-9z" /><circle cx="7.5" cy="7.5" r="1.3" /></>,
  chart: <><path d="M3 3v18h18" /><path d="M7 14v3" /><path d="M12 9v8" /><path d="M17 5v12" /></>,
  trophy: <><path d="M7 4h10v4a5 5 0 0 1-10 0V4z" /><path d="M7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3M9 18h6M10 18v-2M14 18v-2M8 21h8" /></>,
  medal: <><circle cx="12" cy="15" r="6" /><path d="M9 9.5 6.5 3M15 9.5 17.5 3M12 13v4M10 15h4" /></>,
}

function CIcon({ name, size = 15 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      {ICON_PATHS[name]}
    </svg>
  )
}


export function Sidebar({
  active,
  userName,
  userRole,
  boxName,
}: {
  active: string
  userName: string
  userRole: string
  boxName: string
}) {
  const router = useRouter()
  const groups = getNavGroups(userRole)
  const userInitials = initials(userName)
  const boxInitial = boxName ? boxName[0].toUpperCase() : 'C'

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
  }

  // Flatten nav items for mobile bottom bar (first 4 most relevant)
  const allItems = groups.flatMap((g) => g.items)
  const mobileItems = allItems.slice(0, 4)

  return (
    <>
    <aside className="c-sidebar" style={{
      width: 248,
      borderRight: '1px solid var(--c-border)',
      padding: '20px 14px',
      display: 'flex',
      flexDirection: 'column',
      gap: 18,
      background: 'var(--c-surface-sunk)',
      flexShrink: 0,
      height: '100vh',
      overflowY: 'auto',
    }}>
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 6px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 9,
          fontFamily: 'var(--font-space-grotesk)', fontWeight: 700,
          fontSize: 15, letterSpacing: '0.04em', textTransform: 'uppercase',
          color: 'var(--c-ink)',
        }}>
          <CircleMark size={20} />
          <span>Circle</span>
        </div>
        <span className="mono" style={{
          fontSize: 10, color: 'var(--c-ink-muted)',
          border: '1px solid var(--c-border)', padding: '1px 6px', borderRadius: 4,
        }}>v1.0</span>
      </div>

      {/* Gym card */}
      <div style={{
        background: 'var(--c-surface)',
        border: '1px solid var(--c-border)',
        borderRadius: 10,
        padding: '8px 10px',
        display: 'flex', alignItems: 'center', gap: 10,
        boxShadow: 'var(--c-shadow-sm)',
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8,
          background: 'var(--circle-ink)', color: 'var(--circle-lime)',
          display: 'grid', placeItems: 'center',
          fontFamily: 'var(--font-space-grotesk)', fontWeight: 700, fontSize: 13,
          flexShrink: 0,
        }}>{boxInitial}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 13, fontWeight: 600, color: 'var(--c-ink)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{boxName || 'My Gym'}</div>
          <div className="mono" style={{ fontSize: 10.5, color: 'var(--c-ink-muted)', textTransform: 'capitalize' }}>
            {userRole}
          </div>
        </div>
      </div>

      {/* Nav groups */}
      {groups.map((group) => (
        <div key={group.section} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div className="mono" style={{
            fontSize: 10, color: 'var(--c-ink-faint)',
            textTransform: 'uppercase', letterSpacing: '0.1em',
            padding: '2px 10px 6px',
          }}>{group.section}</div>
          {group.items.map((item) => {
            const on = item.key === active
            return (
              <a key={item.key} href={item.href} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '7px 10px', borderRadius: 8,
                color: on ? 'var(--c-ink)' : 'var(--c-ink-2)',
                background: on ? 'var(--c-surface)' : 'transparent',
                boxShadow: on ? 'var(--c-shadow-sm)' : 'none',
                border: on ? '1px solid var(--c-border)' : '1px solid transparent',
                fontSize: 13.5, fontWeight: on ? 600 : 500,
                textDecoration: 'none',
              }}>
                <CIcon name={item.icon} size={15} />
                <span style={{ flex: 1 }}>{item.label}</span>
                {item.badge && (
                  <span className="mono" style={{
                    fontSize: 10,
                    color: item.badgeVariant === 'lime' ? 'var(--circle-lime-ink)' : 'var(--c-danger-ink)',
                    background: item.badgeVariant === 'lime' ? 'var(--circle-lime-soft)' : 'var(--c-danger-soft)',
                    padding: '1px 5px', borderRadius: 4, fontWeight: 600,
                  }}>{item.badge}</span>
                )}
              </a>
            )
          })}
        </div>
      ))}

      {/* User footer */}
      <div style={{
        marginTop: 'auto', borderTop: '1px solid var(--c-divider)',
        paddingTop: 12, display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{
          width: 30, height: 30, borderRadius: '50%',
          background: 'var(--circle-lime)', color: 'var(--circle-ink)',
          display: 'grid', placeItems: 'center',
          fontWeight: 700, fontSize: 12, flexShrink: 0,
        }}>{userInitials}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 12.5, fontWeight: 600, color: 'var(--c-ink)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{userName}</div>
          <div className="mono" style={{
            fontSize: 10.5, color: 'var(--c-ink-muted)', textTransform: 'capitalize',
          }}>{userRole}</div>
        </div>
        <button
          onClick={handleSignOut}
          title="Sign out"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--c-ink-muted)', fontSize: 12, padding: '4px 6px',
            borderRadius: 6,
          }}
        >
          Sign out
        </button>
      </div>
    </aside>

    {/* Mobile bottom nav */}
    <nav className="c-mobile-nav" style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
      background: 'var(--c-surface)', borderTop: '1px solid var(--c-border)',
      padding: '8px 0 env(safe-area-inset-bottom, 8px)',
      justifyContent: 'space-around', alignItems: 'center',
    }}>
      {mobileItems.map((item) => {
        const on = item.key === active
        return (
          <a key={item.key} href={item.href} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
            padding: '4px 12px', borderRadius: 8, textDecoration: 'none',
            color: on ? 'var(--circle-lime-ink)' : 'var(--c-ink-muted)',
          }}>
            <CIcon name={item.icon} size={22} />
            <span style={{ fontSize: 10, fontWeight: on ? 700 : 500 }}>{item.label}</span>
          </a>
        )
      })}
    </nav>
    </>
  )
}
