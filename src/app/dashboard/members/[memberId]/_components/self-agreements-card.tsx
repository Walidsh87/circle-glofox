import Link from 'next/link'

type Sig = { full_name: string; signed_at: string } | null
type TermsSig = { full_name: string; terms_version: number; signed_at: string } | null

function fmt(iso: string) { return iso.slice(0, 10) }

function Doc({ title, status, content }: { title: string; status: React.ReactNode; content: string | null }) {
  return (
    <div className="mt-2.5 border-t border-line pt-2.5">
      <div className="flex items-baseline justify-between gap-2.5">
        <span className="text-[13.5px] font-semibold text-ink">{title}</span>
        <span className="text-right text-xs text-ink-3">{status}</span>
      </div>
      {content && (
        <details className="mt-1.5">
          <summary className="cursor-pointer text-xs text-ink-2">View document</summary>
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
  return (
    <div>
      <Doc
        title="Liability waiver"
        status={waiverSig
          ? <>Signed as {waiverSig.full_name} · {fmt(waiverSig.signed_at)}</>
          : <Link href="/dashboard/sign-waiver" className="font-semibold text-warn transition-colors hover:text-ink">Not signed — sign now →</Link>}
        content={waiverText}
      />
      <Doc
        title="Membership terms"
        status={termsSig
          ? <>Signed v{termsSig.terms_version} · {fmt(termsSig.signed_at)}{termsDoc && termsDoc.version > termsSig.terms_version ? <span className="block text-[11px]">Updated since you signed (current v{termsDoc.version})</span> : null}</>
          : 'Not signed'}
        content={termsDoc?.content ?? null}
      />
      <Doc
        title="PAR-Q (medical readiness)"
        status={parqResponse
          ? <>Answered v{parqResponse.parq_version} · {fmt(parqResponse.signed_at)}{parqDoc && parqDoc.version > parqResponse.parq_version ? <span className="block text-[11px]">Updated since you answered (current v{parqDoc.version})</span> : null}</>
          : <Link href="/dashboard/sign-waiver" className="font-semibold text-warn transition-colors hover:text-ink">Not completed — answer now →</Link>}
        content={parqResponse && parqDoc
          ? parqDoc.questions.map((q, i) => `${q}\n→ ${parqResponse.answers[i] ? 'Yes' : 'No'}`).join('\n\n')
          : null}
      />
    </div>
  )
}
