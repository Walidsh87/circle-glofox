import Link from 'next/link'

type Sig = { full_name: string; signed_at: string } | null
type TermsSig = { full_name: string; terms_version: number; signed_at: string } | null

function fmt(iso: string) { return iso.slice(0, 10) }

function Doc({ title, status, content }: { title: string; status: React.ReactNode; content: string | null }) {
  return (
    <div style={{ borderTop: '1px solid var(--c-divider)', paddingTop: 10, marginTop: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--c-ink)' }}>{title}</span>
        <span style={{ fontSize: 12, color: 'var(--c-ink-muted)', textAlign: 'right' }}>{status}</span>
      </div>
      {content && (
        <details style={{ marginTop: 6 }}>
          <summary style={{ fontSize: 12, color: 'var(--c-ink-2)', cursor: 'pointer' }}>View document</summary>
          <p style={{ fontSize: 12.5, color: 'var(--c-ink-2)', lineHeight: 1.7, whiteSpace: 'pre-wrap', margin: '8px 0 0' }}>{content}</p>
        </details>
      )}
    </div>
  )
}

export function SelfAgreementsCard({ waiverSig, termsSig, waiverText, termsDoc }: {
  waiverSig: Sig
  termsSig: TermsSig
  waiverText: string | null
  termsDoc: { content: string; version: number } | null
}) {
  return (
    <div>
      <Doc
        title="Liability waiver"
        status={waiverSig
          ? <>Signed as {waiverSig.full_name} · {fmt(waiverSig.signed_at)}</>
          : <Link href="/dashboard/sign-waiver" style={{ color: 'var(--c-warn-ink)', fontWeight: 600, textDecoration: 'none' }}>Not signed — sign now →</Link>}
        content={waiverText}
      />
      <Doc
        title="Membership terms"
        status={termsSig
          ? <>Signed v{termsSig.terms_version} · {fmt(termsSig.signed_at)}{termsDoc && termsDoc.version > termsSig.terms_version ? <span style={{ display: 'block', fontSize: 11 }}>Updated since you signed (current v{termsDoc.version})</span> : null}</>
          : 'Not signed'}
        content={termsDoc?.content ?? null}
      />
    </div>
  )
}
