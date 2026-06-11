// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Badge } from './badge'

describe('Badge', () => {
  it('renders neutral by default', () => {
    render(<Badge>Trial</Badge>)
    expect(screen.getByText('Trial').className).toContain('bg-surface-2')
  })

  it('renders status tones', () => {
    render(<Badge tone="ok">Active</Badge>)
    expect(screen.getByText('Active').className).toContain('bg-ok-soft')
    render(<Badge tone="danger">Dunning</Badge>)
    expect(screen.getByText('Dunning').className).toContain('bg-danger-soft')
  })
})
