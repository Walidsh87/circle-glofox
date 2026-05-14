'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

type NavItem = {
  key: string
  label: string
  href: string
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
    { key: 'dashboard', label: 'Dashboard', href: '/dashboard' },
  ]
  if (isOwner) runTheGym.push({ key: 'members', label: 'Member directory', href: '/dashboard/members' })
  if (isOwner) runTheGym.push({ key: 'payments', label: 'Payments', href: '/dashboard/payments' })
  groups.push({ section: 'Run the gym', items: runTheGym })

  if (isStaff) {
    groups.push({
      section: 'Programming',
      items: [
        { key: 'classes', label: 'Class schedule', href: '/dashboard/classes' },
        { key: 'wod', label: 'Daily WOD', href: '/dashboard/wod' },
        { key: 'whiteboard', label: 'Whiteboard', href: '/dashboard/whiteboard', badge: 'live', badgeVariant: 'lime' },
      ],
    })
  }

  groups.push({
    section: 'Athletes',
    items: [
      { key: 'schedule', label: 'Book a class', href: '/dashboard/schedule' },
      { key: 'lifts', label: 'My 1RMs', href: '/dashboard/lifts' },
    ],
  })

  return groups
}

function initials(name: string) {
  return name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
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

  return (
    <aside style={{
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
          fontSize: 15, letterSpacing: '0.02em', textTransform: 'uppercase',
          color: 'var(--c-ink)',
        }}>
          <span className="circle-mark" />
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
                textDecoration: 'none', transition: 'background .1s',
              }}>
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
            borderRadius: 6, transition: 'background .1s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--c-surface-alt)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
        >
          Sign out
        </button>
      </div>
    </aside>
  )
}
