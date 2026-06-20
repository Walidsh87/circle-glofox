import { Card } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type ExportRow = {
  exported_at: string
  ip_address: string | null
  exporter: { full_name?: string } | { full_name?: string }[] | null
}

/** Owner-only PDPL (UAE Federal Decree-Law 45/2021) data-export action + history. */
export function PdplExportCard({ memberId, exports }: { memberId: string; exports: ExportRow[] | null }) {
  const rows = exports ?? []
  return (
    <Card className="mt-5 p-5">
      <div className="mb-3.5 flex items-start justify-between gap-4">
        <div>
          <div className="mb-0.5 text-[13px] font-semibold text-ink">PDPL Data Export</div>
          <div className="text-[11.5px] text-ink-3">
            UAE Federal Decree-Law No. 45 of 2021 — data subject access request
          </div>
        </div>
        <a
          href={`/api/pdpl/export/${memberId}`}
          download
          className={cn(buttonVariants({ size: 'sm' }), 'whitespace-nowrap')}
        >
          Export JSON ↓
        </a>
      </div>

      <div className="mt-1.5 border-t border-line pt-3">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">
          Export history
        </div>
        {rows.length === 0 ? (
          <div className="text-xs text-ink-3">No exports yet.</div>
        ) : (
          rows.map((e, i) => {
            const exporter = (Array.isArray(e.exporter) ? e.exporter[0] : e.exporter) as { full_name?: string } | null
            return (
              <div
                key={i}
                className={cn(
                  'grid grid-cols-[1fr_auto] gap-2.5 py-1.5 text-xs text-ink-2',
                  i < rows.length - 1 && 'border-b border-line'
                )}
              >
                <div>
                  <span className="text-ink">{exporter?.full_name ?? 'Owner'}</span>
                  {e.ip_address && (
                    <span className="ml-2 font-mono text-[11px] text-ink-faint">{e.ip_address}</span>
                  )}
                </div>
                <div className="font-mono text-[11px] text-ink-faint">
                  {new Date(e.exported_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            )
          })
        )}
      </div>
    </Card>
  )
}
