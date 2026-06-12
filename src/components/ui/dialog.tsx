'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Modal dialog on the native <dialog> element — focus trap, Escape, and
 * top-layer stacking come from the platform (no z-index wars; replaces the
 * zIndex 50/100 hand-rolled overlays). Clicking the backdrop closes.
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
  className,
}: {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  className?: string
}) {
  const ref = React.useRef<HTMLDialogElement>(null)

  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open && !el.open) {
      // Feature-detect: jsdom (tests) lacks showModal — fall back to the attribute.
      if (typeof el.showModal === 'function') el.showModal()
      else el.setAttribute('open', '')
    }
    if (!open && el.open) {
      if (typeof el.close === 'function') el.close()
      else el.removeAttribute('open')
    }
  }, [open])

  return (
    <dialog
      ref={ref}
      onCancel={onClose}
      onClick={(e) => {
        // Backdrop clicks target the <dialog> itself; content clicks target children.
        if (e.target === ref.current) onClose()
      }}
      className={cn(
        'w-full max-w-md rounded-xl border border-line bg-surface p-6 text-ink shadow-pop backdrop:bg-black/60',
        className
      )}
    >
      {title && <h2 className="mb-4 font-display text-lg font-semibold text-ink">{title}</h2>}
      {children}
    </dialog>
  )
}
