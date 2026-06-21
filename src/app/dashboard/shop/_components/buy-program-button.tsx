'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useT } from '@/components/i18n/locale-provider'
import { buyProgram } from '../_actions/buy-program'

export function BuyProgramButton({ templateId }: { templateId: string }) {
  const [loading, setLoading] = useState(false)
  const t = useT()

  async function handleClick() {
    setLoading(true)
    const res = await buyProgram(templateId)
    if (res.error) {
      alert(res.error)
      setLoading(false)
      return
    }
    if (res.url) window.location.href = res.url
  }

  return (
    <Button size="sm" onClick={handleClick} disabled={loading}>
      {loading ? t('shop.starting') : t('shop.buyProgram')}
    </Button>
  )
}
