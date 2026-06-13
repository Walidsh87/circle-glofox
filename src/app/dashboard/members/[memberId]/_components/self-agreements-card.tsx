'use client'

import Link from 'next/link'
import { useT } from '@/components/i18n/locale-provider'

type Sig = { full_name: string; signed_at: string } | null
type TermsSig = { full_name: string; terms_version: number; signed_at: string } | null

function fmt(iso: string) { return iso.slice(0, 10) }

function Doc({ title, status, content, viewLabel }: { title: string; status: React.ReactNode; content: string | null; viewLabel: string }) {
  return (
    <div className="mt-2.5 border-t border-line pt-2.5">
      <div className="flex items-baseline justify-between gap-2.5">
        <span className="text-[13.5px] font-semibold text-ink">{title}</span>
        <span className="text-right text-xs text-ink-3">{status}</span>
      </div>
      {content && (
        <details className="mt-1.5">
          <summary className="cursor-pointer text-xs text-ink-2">{viewLabel}</summary>
          <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-ink-2">{content}</p>
        </details>
      )}
    </div>
  )
}

export function SelfAgreementsCard({ waiverSig, termsSig, waiverText, termsDoc, parqResponse, parqDoc }: {
  waiverSig: Sig
  termsSig: TermsSig
  waiverText: string | null
  termsDoc: { content: string; version: number } | null
  parqResponse: { parq_version: number; answers: boolean[]; signed_at: string } | null
  parqDoc: { questions: string[]; version: number } | null
}) {
  const t = useT()
  const viewLabel = t('profile.agreements.viewDocument')
  return (
    <div>
      <Doc
        title={t('profile.agreements.waiver')}
        status={waiverSig
          ? <>{t('profile.agreements.waiverSigned', { name: waiverSig.full_name, date: fmt(waiverSig.signed_at) })}</>
          : <Link href="/dashboard/sign-waiver" className="font-semibold text-warn transition-colors hover:text-ink">{t('profile.agreements.waiverNotSigned')}</Link>}
        content={waiverText}
        viewLabel={viewLabel}
      />
      <Doc
        title={t('profile.agreements.terms')}
        status={termsSig
          ? <>{t('profile.agreements.termsSigned', { version: termsSig.terms_version, date: fmt(termsSig.signed_at) })}{termsDoc && termsDoc.version > termsSig.terms_version ? <span className="block text-[11px]">{t('profile.agreements.termsUpdated', { version: termsDoc.version })}</span> : null}</>
          : t('profile.agreements.termsNotSigned')}
        content={termsDoc?.content ?? null}
        viewLabel={viewLabel}
      />
      <Doc
        title={t('profile.agreements.parq')}
        status={parqResponse
          ? <>{t('profile.agreements.parqAnswered', { version: parqResponse.parq_version, date: fmt(parqResponse.signed_at) })}{parqDoc && parqDoc.version > parqResponse.parq_version ? <span className="block text-[11px]">{t('profile.agreements.parqUpdated', { version: parqDoc.version })}</span> : null}</>
          : <Link href="/dashboard/sign-waiver" className="font-semibold text-warn transition-colors hover:text-ink">{t('profile.agreements.parqNotCompleted')}</Link>}
        content={parqResponse && parqDoc
          ? parqDoc.questions.map((q, i) => `${q}\n→ ${parqResponse.answers[i] ? 'Yes' : 'No'}`).join('\n\n')
          : null}
        viewLabel={viewLabel}
      />
    </div>
  )
}
