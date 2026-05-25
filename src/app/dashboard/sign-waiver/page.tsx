import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SignWaiverForm } from './_components/sign-waiver-form'

export default async function SignWaiverPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role, box_id, boxes(name)')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/onboarding')
  if (profile.role !== 'athlete') redirect('/dashboard')

  const boxes = profile.boxes as { name: string }[] | { name: string } | null
  const boxName = Array.isArray(boxes)
    ? (boxes[0]?.name ?? '')
    : (boxes as { name: string } | null)?.name ?? ''

  // Already signed — redirect to dashboard
  const { data: signature } = await supabase
    .from('waiver_signatures')
    .select('id')
    .eq('box_id', profile.box_id)
    .eq('athlete_id', user.id)
    .maybeSingle()

  if (signature) redirect('/dashboard')

  const { data: waiver } = await supabase
    .from('gym_waivers')
    .select('content')
    .eq('box_id', profile.box_id)
    .single()

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
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            display: 'inline-block',
            background: 'var(--c-surface)',
            border: '1px solid var(--c-border)',
            borderRadius: 8,
            padding: '5px 14px',
            color: 'var(--c-ink-muted)',
            fontSize: 12,
            marginBottom: 14,
            fontFamily: 'var(--font-geist-mono)',
            textTransform: 'uppercase' as const,
            letterSpacing: '0.08em',
          }}>{boxName}</div>
          <h1 style={{
            fontFamily: 'var(--font-space-grotesk)',
            fontSize: 24,
            fontWeight: 700,
            color: 'var(--c-ink)',
            marginBottom: 8,
            letterSpacing: '-0.02em',
          }}>Before you enter the gym</h1>
          <p style={{ color: 'var(--c-ink-muted)', fontSize: 14, margin: 0 }}>
            Please read and sign this liability waiver to continue.
          </p>
        </div>

        {/* Waiver text */}
        {waiver && (
          <div style={{
            background: 'var(--c-surface)',
            border: '1px solid var(--c-border)',
            borderRadius: 10,
            padding: '20px 22px',
            marginBottom: 20,
            maxHeight: 300,
            overflowY: 'auto',
          }}>
            <pre style={{
              fontFamily: 'var(--font-geist-sans)',
              fontSize: 13,
              color: 'var(--c-ink-2)',
              lineHeight: 1.7,
              whiteSpace: 'pre-wrap',
              margin: 0,
            }}>{waiver.content}</pre>
          </div>
        )}

        <SignWaiverForm profileName={profile.full_name} />
      </div>
    </div>
  )
}
