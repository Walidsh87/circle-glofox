import { requirePage } from '@/lib/auth/page-guards'
import { redirect } from 'next/navigation'
import { SignWaiverForm } from './_components/sign-waiver-form'

export default async function SignWaiverPage() {
  const { supabase, user, profile, boxName } = await requirePage()
  if (profile.role !== 'athlete') redirect('/dashboard')

  const [{ data: waiver }, { data: terms }, { data: waiverSig }] = await Promise.all([
    supabase.from('gym_waivers').select('content').eq('box_id', profile.box_id).single(),
    supabase.from('gym_terms').select('content, version').eq('box_id', profile.box_id).single(),
    supabase
      .from('waiver_signatures')
      .select('id')
      .eq('box_id', profile.box_id)
      .eq('athlete_id', user.id)
      .maybeSingle(),
  ])

  const currentTermsVersion = terms?.version ?? 1
  const { data: termsSig } = await supabase
    .from('terms_signatures')
    .select('id')
    .eq('box_id', profile.box_id)
    .eq('athlete_id', user.id)
    .eq('terms_version', currentTermsVersion)
    .maybeSingle()

  const waiverSigned = !!waiverSig
  const termsSigned = !!termsSig

  if (waiverSigned && termsSigned) redirect('/dashboard')

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--c-bg)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '32px 16px',
      fontFamily: 'var(--font-geist-sans)',
    }}>
      <div style={{ width: '100%', maxWidth: 640 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            display: 'inline-block', background: 'var(--c-surface)',
            border: '1px solid var(--c-border)', borderRadius: 8,
            padding: '5px 14px', color: 'var(--c-ink-muted)', fontSize: 12,
            marginBottom: 14, fontFamily: 'var(--font-geist-mono)',
            textTransform: 'uppercase', letterSpacing: '0.08em',
          }}>{boxName}</div>
          <h1 style={{
            fontFamily: 'var(--font-space-grotesk)', fontSize: 24, fontWeight: 700,
            color: 'var(--c-ink)', marginBottom: 8, letterSpacing: '-0.02em',
          }}>Before you enter the gym</h1>
          <p style={{ color: 'var(--c-ink-muted)', fontSize: 14, margin: 0 }}>
            Please read and sign both documents to continue.
          </p>
        </div>

        {!waiverSigned && waiver && (
          <DocBlock title="Liability Waiver" content={waiver.content} />
        )}

        {!termsSigned && terms && (
          <DocBlock title="Membership Terms & Conditions" content={terms.content} />
        )}

        <SignWaiverForm
          profileName={profile.full_name!}
          waiverSigned={waiverSigned}
          termsSigned={termsSigned}
          termsVersion={currentTermsVersion}
        />
      </div>
    </div>
  )
}

function DocBlock({ title, content }: { title: string; content: string }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: 'var(--c-ink-muted)',
        textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8, paddingLeft: 4,
      }}>{title}</div>
      <div style={{
        background: 'var(--c-surface)', border: '1px solid var(--c-border)',
        borderRadius: 10, padding: '20px 22px', maxHeight: 240, overflowY: 'auto',
      }}>
        <pre style={{
          fontFamily: 'var(--font-geist-sans)', fontSize: 13,
          color: 'var(--c-ink-2)', lineHeight: 1.7, whiteSpace: 'pre-wrap', margin: 0,
        }}>{content}</pre>
      </div>
    </div>
  )
}
