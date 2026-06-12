import { requirePage } from '@/lib/auth/page-guards'
import { redirect } from 'next/navigation'
import { SignWaiverForm } from './_components/sign-waiver-form'

export default async function SignWaiverPage() {
  const { supabase, user, profile, boxName } = await requirePage()
  if (profile.role !== 'athlete') redirect('/dashboard')

  const [{ data: waiver }, { data: terms }, { data: waiverSig }, { data: parqDoc }] = await Promise.all([
    supabase.from('gym_waivers').select('content').eq('box_id', profile.box_id).single(),
    supabase.from('gym_terms').select('content, version').eq('box_id', profile.box_id).single(),
    supabase
      .from('waiver_signatures')
      .select('id')
      .eq('box_id', profile.box_id)
      .eq('athlete_id', user.id)
      .maybeSingle(),
    supabase.from('gym_parq').select('questions, version').eq('box_id', profile.box_id).maybeSingle(),
  ])

  const currentTermsVersion = terms?.version ?? 1
  const [{ data: termsSig }, { data: parqResp }] = await Promise.all([
    supabase
      .from('terms_signatures')
      .select('id')
      .eq('box_id', profile.box_id)
      .eq('athlete_id', user.id)
      .eq('terms_version', currentTermsVersion)
      .maybeSingle(),
    parqDoc
      ? supabase
          .from('parq_responses')
          .select('id')
          .eq('box_id', profile.box_id)
          .eq('athlete_id', user.id)
          .eq('parq_version', parqDoc.version)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const waiverSigned = !!waiverSig
  const termsSigned = !!termsSig
  const parqDue = !!parqDoc && !parqResp
  const parqQuestions = (parqDoc?.questions as string[] | undefined) ?? []

  if (waiverSigned && termsSigned && !parqDue) redirect('/dashboard')

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4 py-8">
      <div className="w-full max-w-[640px]">
        <div className="mb-7 text-center">
          <div className="mb-3.5 inline-block rounded-lg border border-line bg-surface px-3.5 py-1 font-mono text-xs uppercase tracking-[0.08em] text-ink-3">
            {boxName}
          </div>
          <h1 className="mb-2 font-display text-2xl font-bold tracking-[-0.02em] text-ink">Before you enter the gym</h1>
          <p className="text-sm text-ink-3">
            Please complete the documents below to continue.
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
          parqDue={parqDue}
          parqQuestions={parqQuestions}
        />
      </div>
    </div>
  )
}

function DocBlock({ title, content }: { title: string; content: string }) {
  return (
    <div className="mb-4">
      <div className="mb-2 pl-1 text-[11px] font-bold uppercase tracking-[0.08em] text-ink-3">{title}</div>
      <div className="max-h-60 overflow-y-auto rounded-[10px] border border-line bg-surface px-[22px] py-5">
        <pre className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-ink-2">{content}</pre>
      </div>
    </div>
  )
}
