// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatCard } from './card'

describe('StatCard', () => {
  it('renders as a link when href is given', () => {
    render(<StatCard label="Athletes" value="248" href="/dashboard/members" />)
    expect(screen.getByRole('link').getAttribute('href')).toBe('/dashboard/members')
  })

  it('applies the warn fill', () => {
    render(<StatCard label="Unpaid" value="3" fill="warn" />)
    expect(screen.getByText('Unpaid').className).toContain('text-warn')
  })
})
