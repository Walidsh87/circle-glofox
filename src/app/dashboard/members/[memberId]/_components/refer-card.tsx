'use client'

import { Button } from '@/components/ui/button'
import { useT } from '@/components/i18n/locale-provider'
import { useCopy } from '@/hooks/use-copy'

export function ReferCard({ link, referred, joined }: { link: string | null; referred: number; joined: number }) {
  const t = useT()
  const { copied, copy } = useCopy()
  if (!link) return null
  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-xs leading-relaxed text-ink-3">
        {t('profile.refer.description')}
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          readOnly
          value={link}
          className="min-w-[200px] flex-1 rounded-lg border border-line bg-canvas px-3 py-2 text-xs text-ink-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
        <Button variant="outline" size="sm" onClick={() => copy(link)}>
          {copied ? t('profile.refer.copied') : t('profile.refer.copyButton')}
        </Button>
      </div>
      <div className="font-mono text-xs text-ink-3">{t('profile.refer.stats', { referred, joined })}</div>
    </div>
  )
}
