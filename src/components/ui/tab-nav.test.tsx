// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TabNav } from './tab-nav'

const TABS = [
  { key: 'members', label: 'Members', href: '/dashboard/members?tab=members', count: 12 },
  { key: 'leads', label: 'Leads', href: '/dashboard/members?tab=leads' },
]

describe('TabNav', () => {
  it('renders links with hrefs and marks the active tab', () => {
    render(<TabNav tabs={TABS} active="leads" />)
    const leads = screen.getByRole('link', { name: 'Leads' })
    expect(leads.getAttribute('aria-current')).toBe('page')
    expect(leads.getAttribute('href')).toBe('/dashboard/members?tab=leads')
    expect(screen.getByRole('link', { name: /Members/ }).getAttribute('aria-current')).toBeNull()
  })

  it('shows the count pill when provided', () => {
    render(<TabNav tabs={TABS} active="members" />)
    expect(screen.getByText('12')).toBeTruthy()
  })
})
