// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Button } from './button'

describe('Button', () => {
  it('renders the lime primary fill by default', () => {
    render(<Button>Save</Button>)
    const btn = screen.getByRole('button', { name: 'Save' })
    expect(btn.className).toContain('bg-accent')
    expect(btn.className).toContain('text-accent-contrast')
  })

  it('renders the danger fill for destructive', () => {
    render(<Button variant="destructive">Delete</Button>)
    expect(screen.getByRole('button', { name: 'Delete' }).className).toContain('bg-danger')
  })

  it('keeps a visible focus ring class', () => {
    render(<Button>Go</Button>)
    expect(screen.getByRole('button', { name: 'Go' }).className).toContain('focus-visible:ring-2')
  })

  it('passes through disabled', () => {
    render(<Button disabled>Nope</Button>)
    expect((screen.getByRole('button', { name: 'Nope' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
