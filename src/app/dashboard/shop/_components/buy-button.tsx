'use client'

import { useState } from 'react'
import { buyPackage } from '../_actions/buy-package'

export function BuyButton({ packageId }: { packageId: string }) {
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    setLoading(true)
    const res = await buyPackage(packageId)
    if (res.error) {
      alert(res.error)
      setLoading(false)
      return
    }
    if (res.url) window.location.href = res.url
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      style={{
        height: 32, padding: '0 16px', background: 'var(--circle-lime)',
        border: 'none', borderRadius: 8, cursor: loading ? 'not-allowed' : 'pointer',
        fontSize: 13, fontWeight: 700, color: 'var(--circle-ink)',
        fontFamily: 'inherit', opacity: loading ? 0.5 : 1,
      }}
    >
      {loading ? 'Starting…' : 'Buy'}
    </button>
  )
}
