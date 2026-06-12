// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Dialog } from './dialog'

describe('Dialog', () => {
  it('opens as a modal when open=true', () => {
    render(
      <Dialog open onClose={() => {}} title="Confirm check-in">
        <p>body</p>
      </Dialog>
    )
    const dialog = screen.getByRole('dialog') as HTMLDialogElement
    expect(dialog.open).toBe(true)
    expect(screen.getByText('Confirm check-in')).toBeTruthy()
  })

  it('calls onClose on cancel (Escape)', () => {
    const onClose = vi.fn()
    render(
      <Dialog open onClose={onClose}>
        <p>body</p>
      </Dialog>
    )
    fireEvent(screen.getByRole('dialog'), new Event('cancel'))
    expect(onClose).toHaveBeenCalled()
  })

  it('stays closed when open=false', () => {
    render(
      <Dialog open={false} onClose={() => {}}>
        <p>body</p>
      </Dialog>
    )
    expect((document.querySelector('dialog') as HTMLDialogElement).open).toBe(false)
  })
})
