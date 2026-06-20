'use client'

import { useState } from 'react'

/** Clipboard copy with a transient "copied" flag that resets after `resetMs`.
 *  No-ops on null/empty text. */
export function useCopy(resetMs = 1500): { copied: boolean; copy: (text: string | null) => void } {
  const [copied, setCopied] = useState(false)
  function copy(text: string | null) {
    if (!text) return
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), resetMs)
  }
  return { copied, copy }
}
