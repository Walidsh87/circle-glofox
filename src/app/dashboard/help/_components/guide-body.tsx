import Link from 'next/link'
import type { HelpBlock } from '@/lib/help/types'

const isExternal = (href: string) => /^https?:\/\//.test(href)

export function GuideBody({ blocks }: { blocks: HelpBlock[] }) {
  return (
    <div className="flex flex-col gap-3 text-[13.5px] leading-relaxed text-ink-2">
      {blocks.map((b, i) => {
        switch (b.type) {
          case 'h': return <h3 key={i} className="mt-2 text-[14px] font-semibold text-ink">{b.text}</h3>
          case 'p': return <p key={i}>{b.text}</p>
          case 'steps': return <ol key={i} className="ml-5 flex list-decimal flex-col gap-1">{b.items.map((it, j) => <li key={j}>{it}</li>)}</ol>
          case 'bullets': return <ul key={i} className="ml-5 flex list-disc flex-col gap-1">{b.items.map((it, j) => <li key={j}>{it}</li>)}</ul>
          case 'code': return <pre key={i} className="overflow-x-auto rounded-lg border border-line bg-surface-2 px-3 py-2 font-mono text-[12px] text-ink">{b.text}</pre>
          case 'note': return <div key={i} className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-[12.5px] text-ink-2">{b.text}</div>
          case 'link': return isExternal(b.href)
            ? <a key={i} href={b.href} target="_blank" rel="noopener noreferrer" className="w-fit text-accent-ink underline underline-offset-2">{b.label} ↗</a>
            : <Link key={i} href={b.href} className="w-fit text-accent-ink underline underline-offset-2">{b.label}</Link>
        }
      })}
    </div>
  )
}
