'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useT } from '@/components/i18n/locale-provider'
import { buyPackage } from '../_actions/buy-package'

export function BuyButton({ packageId }: { packageId: string }) {
  const [loading, setLoading] = useState(false)
  const t = useT()

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
      {loading ? t('shop.starting') : t('shop.buy')}
    </Button>
  )
}
