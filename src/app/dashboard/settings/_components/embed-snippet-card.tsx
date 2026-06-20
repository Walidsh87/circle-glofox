'use client'

import { useCopy } from '@/hooks/use-copy'

/** Copy-able embeddable-widget snippet card (lead-capture / schedule). Renders a
 *  "set your slug" hint when no snippet is available yet. */
export function EmbedSnippetCard({ title, description, snippet }: { title: string; description: string; snippet: string | null }) {
  const { copied, copy } = useCopy()

  return (
    <div className="mt-6 rounded-[14px] border border-line bg-surface px-[22px] py-5">
      <div className="text-sm font-semibold text-ink">{title}</div>
      <p className="mt-1 text-[12.5px] leading-normal text-ink-3">{description}</p>
      {snippet ? (
        <>
          <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-all rounded-lg border border-line bg-canvas px-3 py-2.5 text-[11.5px] text-ink-2">{snippet}</pre>
          <button
            onClick={() => copy(snippet)}
            className="mt-2.5 h-9 rounded-lg border border-line-strong bg-surface px-3.5 text-[12.5px] font-semibold text-ink-2 transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {copied ? 'Copied!' : 'Copy embed code'}
          </button>
        </>
      ) : (
        <p className="mt-3 text-[12.5px] text-ink-3">Set your gym’s public URL slug above to generate the embed code.</p>
      )}
    </div>
  )
}
