// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Field, Select } from './field'

describe('Field', () => {
  it('associates the label with the input', () => {
    render(<Field label="Email" type="email" />)
    expect(screen.getByLabelText('Email')).toBeTruthy()
  })

  it('wires the error to the input via aria-describedby and announces it', () => {
    render(<Field label="Email" error="Invalid email address." />)
    const input = screen.getByLabelText('Email')
    const error = screen.getByRole('alert')
    expect(error.textContent).toBe('Invalid email address.')
    expect(input.getAttribute('aria-describedby')).toBe(error.id)
    expect(input.getAttribute('aria-invalid')).toBe('true')
  })

  it('shows no alert when there is no error', () => {
    render(<Field label="Email" />)
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('Select', () => {
  it('renders a native select with its options', () => {
    render(
      <Select aria-label="Role">
        <option value="coach">Coach</option>
        <option value="owner">Owner</option>
      </Select>
    )
    expect(screen.getByLabelText('Role').tagName).toBe('SELECT')
    expect(screen.getByText('Owner')).toBeTruthy()
  })
})
