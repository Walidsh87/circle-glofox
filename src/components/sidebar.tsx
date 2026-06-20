'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { CircleMark } from '@/components/circle-mark'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { useT } from '@/components/i18n/locale-provider'
import { cn } from '@/lib/utils'

type NavItem = {
  key: string
  label: string
  labelKey?: string
  href: string
  icon: string
  badge?: string
  badgeVariant?: 'lime' | 'danger'
}

type NavGroup = {
  section: string
  sectionKey?: string
  items: NavItem[]
}

function getNavGroups(role: string): NavGroup[] {
  const isOwner = role === 'owner'
  const isManager = role === 'owner' || role === 'admin'
  const isProgramming = isManager || role === 'coach'
  const isStaff = isProgramming || role === 'receptionist'

  const groups: NavGroup[] = []

  const runTheGym: NavItem[] = [
    { key: 'dashboard', label: 'Dashboard', href: '/dashboard', icon: 'home' },
  ]
  if (isOwner) runTheGym.push({ key: 'kpi', label: 'Metrics', href: '/dashboard/kpi', icon: 'chart' })
  if (isManager) runTheGym.push({ key: 'reports', label: 'Reports', href: '/dashboard/reports', icon: 'chart' })
  if (isStaff) runTheGym.push({ key: 'retention', label: 'Retention', href: '/dashboard/retention', icon: 'activity' })
  if (isManager) runTheGym.push({ key: 'lifecycle', label: 'Lifecycle', href: '/dashboard/lifecycle', icon: 'funnel' })
  if (isStaff) runTheGym.push({ key: 'members', label: 'Member directory', href: '/dashboard/members', icon: 'users' })
  if (isStaff) runTheGym.push({ key: 'desk', label: 'Front Desk', href: '/dashboard/desk', icon: 'desk' })
  if (isStaff) runTheGym.push({ key: 'quotes', label: 'Quotes', href: '/dashboard/quotes', icon: 'book' })
  if (isManager) runTheGym.push({ key: 'waivers', label: 'Waivers', href: '/dashboard/waivers', icon: 'shield' })
  if (isOwner) runTheGym.push({ key: 'payments', label: 'Payments', href: '/dashboard/payments', icon: 'card' })
  if (isManager) runTheGym.push({ key: 'packages', label: 'Packages', href: '/dashboard/packages', icon: 'tag' })
  if (isManager) runTheGym.push({ key: 'broadcasts', label: 'Broadcasts', href: '/dashboard/broadcasts', icon: 'megaphone' })
  if (isManager) runTheGym.push({ key: 'automations', label: 'Automations', href: '/dashboard/automations', icon: 'zap' })
  if (isManager) runTheGym.push({ key: 'sequences', label: 'Sequences', href: '/dashboard/sequences', icon: 'layers' })
  if (isManager) runTheGym.push({ key: 'sms', label: 'SMS', href: '/dashboard/sms', icon: 'phone' })
  if (isManager) runTheGym.push({ key: 'whatsapp', label: 'WhatsApp', href: '/dashboard/whatsapp', icon: 'wa' })
  if (isStaff) runTheGym.push({ key: 'inbox', label: 'Inbox', href: '/dashboard/inbox', icon: 'chat' })
  if (isStaff) runTheGym.push({ key: 'tasks', label: 'Follow-ups', href: '/dashboard/tasks', icon: 'checklist' })
  if (isManager) runTheGym.push({ key: 'referrals', label: 'Referrals', href: '/dashboard/referrals', icon: 'gift' })
  if (isOwner) runTheGym.push({ key: 'attribution', label: 'Attribution', href: '/dashboard/attribution', icon: 'chart' })
  if (isOwner) runTheGym.push({ key: 'settings', label: 'Settings', href: '/dashboard/settings', icon: 'settings' })
  if (isOwner) runTheGym.push({ key: 'audit', label: 'Audit log', href: '/dashboard/audit', icon: 'book' })
  groups.push({ section: 'Run the gym', items: runTheGym })

  if (isStaff) {
    const programmingItems: NavItem[] = [
      { key: 'prep', label: 'Class prep', href: '/dashboard/prep', icon: 'users' },
      { key: 'classes', label: 'Class schedule', href: '/dashboard/classes', icon: 'calendar' },
      { key: 'availability', label: 'Availability', href: '/dashboard/availability', icon: 'clock' },
      { key: 'pt', label: 'PT sessions', href: '/dashboard/pt', icon: 'calendar' },
      { key: 'cover', label: 'Cover', href: '/dashboard/cover', icon: 'swap' },
    ]
    if (isProgramming) programmingItems.push({ key: 'wod', label: 'Daily WOD', href: '/dashboard/wod', icon: 'flame' })
    if (isProgramming) programmingItems.push({ key: 'programming', label: 'WOD Planner', href: '/dashboard/programming', icon: 'calendar' })
    programmingItems.push({ key: 'whiteboard', label: 'Whiteboard', href: '/dashboard/whiteboard', icon: 'monitor', badge: 'live', badgeVariant: 'lime' })
    groups.push({ section: 'Programming', items: programmingItems })
  }

  const athleteItems: NavItem[] = []
  if (!isStaff) athleteItems.push({ key: 'wod', label: 'Daily WOD', labelKey: 'nav.dailyWod', href: '/dashboard/wod', icon: 'flame' })
  athleteItems.push({ key: 'schedule', label: 'Book a class', labelKey: 'nav.bookClass', href: '/dashboard/schedule', icon: 'book' })
  athleteItems.push({ key: 'timer', label: 'Timer', labelKey: 'nav.timer', href: '/dashboard/timer', icon: 'clock' })
  if (!isStaff) athleteItems.push({ key: 'shop', label: 'Buy a pack', labelKey: 'nav.buyPack', href: '/dashboard/shop', icon: 'tag' })
  athleteItems.push({ key: 'lifts', label: 'My 1RMs', labelKey: 'nav.my1rms', href: '/dashboard/lifts', icon: 'barbell' })
  athleteItems.push({ key: 'skills', label: 'Skills', labelKey: 'nav.skills', href: '/dashboard/skills', icon: 'medal' })
  athleteItems.push({ key: 'goals', label: 'My goals', labelKey: 'nav.goals', href: '/dashboard/goals', icon: 'target' })
  athleteItems.push({ key: 'program', label: 'My program', labelKey: 'nav.program', href: '/dashboard/program', icon: 'clipboard' })
  athleteItems.push({ key: 'feed', label: 'Activity Feed', labelKey: 'nav.activityFeed', href: '/dashboard/feed', icon: 'activity' })
  athleteItems.push({ key: 'committed-club', label: 'Committed Club', labelKey: 'nav.committedClub', href: '/dashboard/committed-club', icon: 'trophy' })
  athleteItems.push({ key: 'achievements', label: 'Achievements', labelKey: 'nav.achievements', href: '/dashboard/achievements', icon: 'award' })
  athleteItems.push({ key: 'messages', label: 'Messages', labelKey: 'nav.messages', href: '/dashboard/messages', icon: 'chat' })
  athleteItems.push({ key: 'profile', label: 'My Profile', labelKey: 'nav.myProfile', href: '/dashboard/profile', icon: 'person' })
  groups.push({ section: 'Athletes', sectionKey: 'nav.athletesSection', items: athleteItems })

  return groups
}

function initials(name: string | null) {
  return (name ?? '').split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
}

const ICON_PATHS: Record<string, React.ReactNode> = {
  home: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V20h14V9.5" /></>,
  users: <><circle cx="9" cy="8" r="3.2" /><path d="M3 19c0-3.3 2.7-6 6-6s6 2.7 6 6" /><circle cx="17" cy="9" r="2.5" /><path d="M15 19c0-2.5 1.8-4.5 4-4.5" /></>,
  desk: <><rect x="3" y="9" width="18" height="3" rx="1" /><path d="M5 12v7M19 12v7M4 9l2-4h12l2 4M9 16h6" /></>,
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
  award: <><circle cx="12" cy="8" r="6" /><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11" /></>,
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></>,
  clipboard: <><rect x="8" y="3" width="8" height="4" rx="1" /><path d="M8 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 12h6M9 16h4" /></>,
  megaphone: <><path d="M3 11v2a1 1 0 0 0 1 1h3l5 4V6L7 10H4a1 1 0 0 0-1 1z" /><path d="M16 9a3 3 0 0 1 0 6" /></>,
  zap: <><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" /></>,
  funnel: <><path d="M3 5h18l-7 8v6l-4 2v-8z" /></>,
  layers: <><path d="M12 3 3 8l9 5 9-5-9-5z" /><path d="M3 13l9 5 9-5" /></>,
  phone: <><path d="M5 4h4l2 5-3 2a11 11 0 0 0 5 5l2-3 5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" /></>,
  wa: <><path d="M3 21l1.6-4.5A8 8 0 1 1 8 19.4z" /><path d="M8.5 9c.3 2 2.5 4.2 4.5 4.5l1-1.4 2 .8v1.6c-2.4.4-5.6-.8-7-3-1-1.6-1.3-3-1-3.8z" /></>,
  chat: <><path d="M4 5h16v11H8l-4 4z" /><path d="M8 9h8M8 12h5" /></>,
  checklist: <><path d="M9 6h11M9 12h11M9 18h11" /><path d="M4 6l1.5 1.5L8 5M4 12l1.5 1.5L8 11M4 18l1.5 1.5L8 17" /></>,
  gift: <><rect x="3" y="8" width="18" height="4" rx="1" /><path d="M5 12v9h14v-9M12 8v13" /><path d="M12 8S10 3 7.5 4.5 9.5 8 12 8zM12 8s2-5 4.5-3.5S14.5 8 12 8z" /></>,
  swap: <><path d="M7 4 3 8l4 4" /><path d="M3 8h14" /><path d="M17 20l4-4-4-4" /><path d="M21 16H7" /></>,
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
  userName: string | null
  userRole: string
  boxName: string
}) {
  const router = useRouter()
  const t = useT()
  const groups = getNavGroups(userRole)
  const userInitials = initials(userName)
  const boxInitial = boxName ? boxName[0].toUpperCase() : 'C'

  async function handleSignOut() {
    document.cookie = 'locale=; Max-Age=0; path=/'
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
  }

  // Flatten nav items for mobile bottom bar (first 4 most relevant)
  const allItems = groups.flatMap((g) => g.items)
  const mobileItems = allItems.slice(0, 4)

  return (
    <>
      <aside className="hidden h-screen w-[248px] shrink-0 flex-col gap-[18px] overflow-y-auto border-r border-line bg-surface-2 px-3.5 py-5 md:flex">
        {/* Logo */}
        <div className="flex items-center justify-between px-1.5">
          <div className="flex items-center gap-2 font-display text-[15px] font-semibold text-ink">
            <CircleMark size={20} />
            <span>Circle</span>
          </div>
          <span className="font-mono rounded border border-line px-1.5 py-px text-[10px] text-ink-3">
            v1.0
          </span>
        </div>

        {/* Gym card */}
        <div className="flex items-center gap-2.5 rounded-[10px] border border-line bg-surface p-2 shadow-card">
          <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[#0A0A0A] font-display text-[13px] font-bold text-[#C8F135]">
            {boxInitial}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold text-ink">
              {boxName || 'My Gym'}
            </div>
            <div className="font-mono text-xs capitalize text-ink-3">{userRole}</div>
          </div>
        </div>

        {/* Nav groups */}
        {groups.map((group) => (
          <div key={group.section} className="flex flex-col gap-0.5">
            <div className="font-mono px-2.5 pb-1.5 pt-0.5 text-xs uppercase tracking-[0.1em] text-ink-3">
              {group.sectionKey ? t(group.sectionKey) : group.section}
            </div>
            {group.items.map((item) => {
              const on = item.key === active
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  aria-current={on ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-2.5 rounded-lg border px-2.5 py-[7px] text-[13.5px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                    on
                      ? 'border-line bg-surface font-semibold text-ink shadow-card'
                      : 'border-transparent font-medium text-ink-2 hover:bg-surface hover:text-ink'
                  )}
                >
                  <CIcon name={item.icon} size={15} />
                  <span className="flex-1">{item.labelKey ? t(item.labelKey) : item.label}</span>
                  {item.badge && (
                    <span
                      className={cn(
                        'font-mono rounded px-1 py-px text-[10px] font-semibold',
                        item.badgeVariant === 'lime'
                          ? 'bg-accent-soft text-accent-ink'
                          : 'bg-danger-soft text-danger'
                      )}
                    >
                      {item.badge}
                    </span>
                  )}
                </Link>
              )
            })}
          </div>
        ))}

        {/* User footer */}
        <div className="mt-auto flex items-center gap-2.5 border-t border-line pt-3">
          <div className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full bg-accent text-xs font-bold text-accent-contrast">
            {userInitials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12.5px] font-semibold text-ink">{userName}</div>
            <div className="font-mono text-xs capitalize text-ink-3">{userRole}</div>
          </div>
          <ThemeToggle />
          <button
            onClick={handleSignOut}
            title="Sign out"
            className="rounded-md px-1.5 py-1 text-xs text-ink-3 transition-colors hover:bg-surface hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {t('nav.signOut')}
          </button>
        </div>
      </aside>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-around border-t border-line bg-surface pb-[env(safe-area-inset-bottom,8px)] pt-2 md:hidden">
        {mobileItems.map((item) => {
          const on = item.key === active
          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={on ? 'page' : undefined}
              className={cn(
                'flex flex-col items-center gap-[3px] rounded-lg px-3 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                on ? 'text-accent-ink' : 'text-ink-3'
              )}
            >
              <CIcon name={item.icon} size={22} />
              <span className={cn('text-[11px]', on ? 'font-bold' : 'font-medium')}>
                {item.labelKey ? t(item.labelKey) : item.label}
              </span>
            </Link>
          )
        })}
      </nav>
    </>
  )
}
