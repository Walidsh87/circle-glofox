import { requireManagerPage } from '@/lib/auth/page-guards'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, Th, Td } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { AddPackageForm } from './_components/add-package-form'
import { PackageActions } from './_components/package-actions'

const TYPE_LABEL: Record<string, string> = {
  class_pack: 'Class pack',
  drop_in: 'Drop-in',
  pt_block: 'PT block',
}

export default async function PackagesPage() {
  const { supabase, profile, boxName } = await requireManagerPage()

  const { data: packages } = await supabase
    .from('packages')
    .select('id, name, type, credit_count, price_aed, expiry_days, active')
    .eq('box_id', profile.box_id)
    .order('active', { ascending: false })
    .order('name')

  return (
    <DashboardShell
      active="packages"
      userName={profile.full_name!}
      userRole={profile.role}
      boxName={boxName}
      title="Packages"
      actions={<span className="font-mono text-xs text-ink-3">{packages?.length ?? 0} packages</span>}
    >
      <Card className="mb-5 max-w-2xl p-5">
        <p className="mb-3 text-[13px] font-semibold text-ink">Add a package</p>
        <AddPackageForm />
      </Card>

      <Table>
        <thead>
          <tr className="bg-surface-2">
            <Th>Package</Th><Th>Type</Th><Th>Credits</Th><Th>Price</Th><Th>Expiry</Th><Th>Status</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {packages?.map((p) => (
            <tr key={p.id} className={cn('last:[&>td]:border-0', !p.active && 'opacity-50')}>
              <Td className="font-semibold">{p.name}</Td>
              <Td className="text-ink-3">{TYPE_LABEL[p.type] ?? p.type}</Td>
              <Td className="font-mono text-ink-3">{p.credit_count}</Td>
              <Td className="font-mono text-ink-3">{Number(p.price_aed).toFixed(2)} AED</Td>
              <Td className="font-mono text-ink-3">{p.expiry_days ? `${p.expiry_days}d` : '—'}</Td>
              <Td>
                <Badge tone={p.active ? 'ok' : 'neutral'}>{p.active ? 'Active' : 'Inactive'}</Badge>
              </Td>
              <Td>
                <PackageActions packageId={p.id} active={p.active} />
              </Td>
            </tr>
          ))}
          {(!packages || packages.length === 0) && (
            <tr>
              <td colSpan={7} className="px-4 py-10 text-center text-[13px] text-ink-3">
                No packages yet. Add one above.
              </td>
            </tr>
          )}
        </tbody>
      </Table>
    </DashboardShell>
  )
}
