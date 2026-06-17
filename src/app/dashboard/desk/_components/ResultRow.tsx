'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import type { PersonHit } from '../_lib/search'
import { DeskCheckIn } from './DeskCheckIn'
import { PaymentActions } from './PaymentActions'
import { WalkInPanel } from './WalkInPanel'
import { DeskAddNote } from './DeskAddNote'

type Drawer = 'checkin' | 'payment' | 'note' | null

export function ResultRow({ hit }: { hit: PersonHit }) {
  const [drawer, setDrawer] = useState<Drawer>(null)

  const subLine = [hit.email, hit.phone].filter(Boolean).join(' · ')

  return (
    <div className="rounded-lg border border-line bg-surface p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-semibold text-ink">{hit.name}</span>
            {hit.kind === 'member' ? (
              <span
                className={`font-mono rounded px-1.5 py-px text-[10px] uppercase ${
                  hit.status === 'paid'
                    ? 'bg-accent-soft text-accent-ink'
                    : 'bg-surface-2 text-ink-3'
                }`}
              >
                {hit.status}
              </span>
            ) : (
              <span className="font-mono rounded bg-surface-2 px-1.5 py-px text-[10px] uppercase text-ink-3">
                LEAD · {hit.source}
              </span>
            )}
          </div>
          {subLine && <span className="text-[12px] text-ink-3">{subLine}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {hit.kind === 'member' ? (
            <>
              <Button size="sm" variant="outline" onClick={() => setDrawer(drawer === 'checkin' ? null : 'checkin')}>
                Check in
              </Button>
              <Button size="sm" variant="outline" onClick={() => setDrawer(drawer === 'payment' ? null : 'payment')}>
                Take payment
              </Button>
              <Button size="sm" variant="outline" onClick={() => setDrawer(drawer === 'note' ? null : 'note')}>
                Add note
              </Button>
              <Link href={`/dashboard/members/${hit.id}`}>
                <Button size="sm" variant="outline">Open</Button>
              </Link>
            </>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={() => setDrawer(drawer === 'checkin' ? null : 'checkin')}>
                Sign up now
              </Button>
              <Link href="/dashboard/members?tab=leads">
                <Button size="sm" variant="outline">Open</Button>
              </Link>
            </>
          )}
        </div>
      </div>
      {hit.kind === 'member' && drawer === 'checkin' && (
        <div className="mt-3">
          <DeskCheckIn athleteId={hit.id} />
        </div>
      )}
      {hit.kind === 'member' && drawer === 'payment' && (
        <div className="mt-3">
          <PaymentActions athleteId={hit.id} />
        </div>
      )}
      {hit.kind === 'member' && drawer === 'note' && (
        <div className="mt-3">
          <DeskAddNote athleteId={hit.id} />
        </div>
      )}
      {hit.kind === 'lead' && drawer === 'checkin' && (
        <div className="mt-3">
          <WalkInPanel leadId={hit.id} initialName={hit.name} />
        </div>
      )}
    </div>
  )
}
