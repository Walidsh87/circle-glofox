// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { LoginForm } from './login-form'

const signInWithPassword = vi.fn()
const signInWithOtp = vi.fn()
const verifyOtp = vi.fn()

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      signInWithPassword: (...a: unknown[]) => signInWithPassword(...a),
      signInWithOtp: (...a: unknown[]) => signInWithOtp(...a),
      verifyOtp: (...a: unknown[]) => verifyOtp(...a),
    },
  }),
}))

describe('LoginForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders password mode by default', () => {
    render(<LoginForm redirectTo="/dashboard" newUserHint={<span>hint</span>} />)
    expect(screen.getByLabelText('Email')).toBeTruthy()
    expect(screen.getByLabelText('Password')).toBeTruthy()
    // exact name — /sign in/i would also match the "Sign in with a code instead" switch
    expect(screen.getByRole('button', { name: 'Sign in →' })).toBeTruthy()
  })

  it('switches to code mode and back', () => {
    render(<LoginForm redirectTo="/dashboard" newUserHint={null} />)
    fireEvent.click(screen.getByRole('button', { name: /sign in with a code instead/i }))
    expect(screen.queryByLabelText('Password')).toBeNull()
    expect(screen.getByRole('button', { name: /send code/i })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /use a password instead/i }))
    expect(screen.getByLabelText('Password')).toBeTruthy()
  })

  it('sends the code with shouldCreateUser and shows the verify step', async () => {
    signInWithOtp.mockResolvedValue({ error: null })
    render(<LoginForm redirectTo="/dashboard" newUserHint={null} />)
    fireEvent.click(screen.getByRole('button', { name: /sign in with a code instead/i }))
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.co' } })
    fireEvent.click(screen.getByRole('button', { name: /send code/i }))
    await waitFor(() => expect(screen.getByLabelText('6-digit code')).toBeTruthy())
    expect(signInWithOtp).toHaveBeenCalledWith({
      email: 'a@b.co',
      options: { shouldCreateUser: true },
    })
  })

  it('shows the auth error as an alert', async () => {
    signInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } })
    render(<LoginForm redirectTo="/dashboard" newUserHint={null} />)
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.co' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in →' }))
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('Invalid login credentials')
    )
  })
})
