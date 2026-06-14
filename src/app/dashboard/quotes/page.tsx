import { requireStaffPage } from '@/lib/auth/page-guards'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, Th, Td } from '@/components/ui/table'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

const STATUS_TONE: Record<string, 'ok' | 'neutral' | 'warn' | 'danger'> = {
  draft: 'neutral', sent: 'warn', accepted: 'warn', paid: 'ok', declined: 'danger', expired: 'danger', void: 'neutral',
}

export default async function QuotesPage() {
  const { supabase, profile, boxName } = await requireStaffPage()
  const { data: quotes } = await supabase
    .from('quotes')
    .select('id, quote_number, title, buyer_name, total_aed, status, created_at')
    .eq('box_id', profile.box_id)
    .order('created_at', { ascending: false })

  return (
    <DashboardShell
      active="quotes"
      userName={profile.full_name!}
      userRole={profile.role}
      boxName={boxName}
      title="Quotes"
      actions={<Link href="/dashboard/quotes/new"><Button size="sm">New quote</Button></Link>}
    >
      <Card className="overflow-hidden p-0">
        <Table>
          <thead>
            <tr className="bg-surface-2">
              <Th>Number</Th><Th>Title</Th><Th>Buyer</Th><Th>Total</Th><Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {quotes?.map((q) => (
              <tr key={q.id} className="last:[&>td]:border-0 hover:bg-surface-2">
                <Td className="font-mono text-ink-3">
                  <Link href={`/dashboard/quotes/${q.id}`} className="hover:underline">{q.quote_number ?? '—'}</Link>
                </Td>
                <Td className="font-semibold">{q.title}</Td>
                <Td className="text-ink-3">{q.buyer_name}</Td>
                <Td className="font-mono text-ink-3">{Number(q.total_aed).toFixed(2)} AED</Td>
                <Td><Badge tone={STATUS_TONE[q.status] ?? 'neutral'}>{q.status}</Badge></Td>
              </tr>
            ))}
            {(!quotes || quotes.length === 0) && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-[13px] text-ink-3">No quotes yet. Create one above.</td></tr>
            )}
          </tbody>
        </Table>
      </Card>
    </DashboardShell>
  )
}
