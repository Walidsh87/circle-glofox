'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
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
    <Button size="sm" onClick={handleClick} disabled={loading}>
      {loading ? 'Starting…' : 'Buy'}
    </Button>
  )
}
