import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { onboardingProgress, type OnboardingStep } from '@/lib/onboarding'
import { dismissOnboarding } from '../_actions/dismiss-onboarding'

export function OnboardingChecklist({ steps }: { steps: OnboardingStep[] }) {
  const { done, total } = onboardingProgress(steps)
  return (
    <Card className="mb-6 p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-[14px] font-semibold text-ink">Get your gym set up</div>
          <div className="font-mono text-[11.5px] text-ink-3">{done}/{total} done</div>
        </div>
        <form action={dismissOnboarding}>
          <button type="submit" className="text-[11.5px] text-ink-faint underline hover:text-ink-3">Dismiss</button>
        </form>
      </div>
      <div className="flex flex-col gap-1.5">
        {steps.map((s) => (
          <div key={s.key} className="flex items-center gap-2.5 rounded-lg border border-line bg-surface px-3 py-2">
            <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold ${s.done ? 'bg-ok-soft text-ok' : 'border border-line-strong text-ink-faint'}`}>{s.done ? '✓' : ''}</span>
            <span className={`flex-1 text-[13px] ${s.done ? 'text-ink-3 line-through' : 'text-ink'}`}>{s.label}</span>
            {!s.done && (
              <span className="flex shrink-0 items-center gap-2">
                <Link href={s.href} className="rounded-lg bg-accent px-2.5 py-1 text-[11.5px] font-semibold text-accent-ink">Set up</Link>
                <Link href={`/dashboard/help?topic=${s.helpTopic}`} className="text-[11px] text-ink-3 underline">Learn how</Link>
              </span>
            )}
          </div>
        ))}
      </div>
    </Card>
  )
}
