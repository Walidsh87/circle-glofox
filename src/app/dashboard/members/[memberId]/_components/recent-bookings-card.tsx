import { Card } from '@/components/ui/card'
import { getServerT } from '@/lib/i18n/server'
import { formatDate } from '../_lib/profile-format'

type TemplateRef = { name: string }
type InstanceRef = { starts_at: string; class_templates: TemplateRef | TemplateRef[] | null }
export type BookingRow = { id: string; checked_in: boolean | null; class_instances: InstanceRef | InstanceRef[] | null }

const rowClass = 'border-b border-line last:border-0'

/** The member's 10 most recent class bookings. */
export async function RecentBookingsCard({ bookings }: { bookings: BookingRow[] | null }) {
  const t = await getServerT()
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-line bg-surface-2 px-4 py-3">
        <span className="text-[13px] font-semibold text-ink">{t('profile.bookings.section')}</span>
      </div>
      {bookings && bookings.length > 0 ? (
        <table className="w-full">
          <tbody>
            {bookings.map((b) => {
              const inst = Array.isArray(b.class_instances) ? b.class_instances[0] : b.class_instances
              const tmpl = inst ? (Array.isArray(inst.class_templates) ? inst.class_templates[0] : inst.class_templates) : null
              const startsAt = inst?.starts_at ? new Date(inst.starts_at) : null
              return (
                <tr key={b.id} className={rowClass}>
                  <td className="px-4 py-2.5 text-[13px] text-ink-2">{tmpl?.name ?? '—'}</td>
                  <td className="px-4 py-2.5 text-end">
                    <span className="font-mono text-xs text-ink-3">
                      {startsAt ? formatDate(startsAt.toISOString()) : '—'}
                    </span>
                  </td>
                  <td className="w-[60px] px-4 py-2.5 text-end">
                    {b.checked_in && <span className="text-[11.5px] font-semibold text-ok">{t('profile.bookings.checkedIn')}</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      ) : (
        <div className="px-4 py-7 text-center text-[13px] text-ink-3">{t('profile.bookings.empty')}</div>
      )}
    </Card>
  )
}
