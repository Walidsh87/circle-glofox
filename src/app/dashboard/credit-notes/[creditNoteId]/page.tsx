import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { PrintButton } from '../../invoices/[invoiceId]/_components/print-button'

function fmtDate(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso))
}

function fmtAed(n: number): string {
  return new Intl.NumberFormat('en-AE', { style: 'currency', currency: 'AED', minimumFractionDigits: 2 }).format(n)
}

export default async function CreditNotePage({ params }: { params: { creditNoteId: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: cn } = await supabase
    .from('credit_notes')
    .select('*')
    .eq('id', params.creditNoteId)
    .single()

  if (!cn) notFound()

  return (
    <div style={{ background: '#f6f6f6', minHeight: '100vh', padding: '40px 20px', fontFamily: 'var(--font-geist-sans), system-ui, sans-serif' }}>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .invoice-sheet { box-shadow: none !important; margin: 0 !important; max-width: none !important; }
        }
      `}</style>

      <div className="no-print" style={{ maxWidth: 800, margin: '0 auto 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Link href={`/dashboard/invoices/${cn.invoice_id}`} style={{ fontSize: 13, color: '#666', textDecoration: 'none' }}>
          ← Back to invoice {cn.invoice_number_snapshot}
        </Link>
        <PrintButton />
      </div>

      <div className="invoice-sheet" style={{
        maxWidth: 800, margin: '0 auto', background: 'white',
        padding: '48px 56px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        color: '#111', fontSize: 14, lineHeight: 1.5,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 40 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>CREDIT NOTE</h1>
            <div style={{ marginTop: 4, fontSize: 12, color: '#666' }}>Tax credit note — UAE Federal Decree-Law 8 of 2017</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{cn.credit_note_number}</div>
            <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>Issued {fmtDate(cn.issued_at)}</div>
            <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
              Against invoice <span style={{ fontFamily: 'var(--font-geist-mono), monospace' }}>{cn.invoice_number_snapshot}</span>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, marginBottom: 36 }}>
          <div>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#888', marginBottom: 6 }}>From</div>
            <div style={{ fontWeight: 600 }}>{cn.legal_name_snapshot ?? '—'}</div>
            {cn.billing_address_snapshot && (
              <div style={{ whiteSpace: 'pre-line', color: '#444', marginTop: 2 }}>{cn.billing_address_snapshot}</div>
            )}
            {cn.trn_snapshot && (
              <div style={{ marginTop: 6, fontSize: 12 }}><span style={{ color: '#888' }}>TRN:</span> <span style={{ fontFamily: 'var(--font-geist-mono), monospace' }}>{cn.trn_snapshot}</span></div>
            )}
          </div>
          <div>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#888', marginBottom: 6 }}>Refunded to</div>
            <div style={{ fontWeight: 600 }}>{cn.customer_name_snapshot ?? '—'}</div>
            {cn.customer_email_snapshot && (
              <div style={{ color: '#444', marginTop: 2 }}>{cn.customer_email_snapshot}</div>
            )}
          </div>
        </div>

        {cn.reason && (
          <div style={{ marginBottom: 24, fontSize: 13 }}>
            <span style={{ color: '#888' }}>Reason: </span>{cn.reason}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 40 }}>
          <table style={{ minWidth: 280, fontVariantNumeric: 'tabular-nums' }}>
            <tbody>
              <tr><td style={{ padding: '4px 0', color: '#666' }}>Subtotal</td><td style={{ padding: '4px 0 4px 32px', textAlign: 'right' }}>−{fmtAed(Number(cn.subtotal_aed))}</td></tr>
              <tr><td style={{ padding: '4px 0', color: '#666' }}>VAT ({Number(cn.vat_rate).toFixed(0)}%)</td><td style={{ padding: '4px 0 4px 32px', textAlign: 'right' }}>−{fmtAed(Number(cn.vat_aed))}</td></tr>
              <tr style={{ borderTop: '2px solid #111' }}>
                <td style={{ padding: '10px 0 0', fontWeight: 700 }}>Total refunded</td>
                <td style={{ padding: '10px 0 0 32px', textAlign: 'right', fontWeight: 700, fontSize: 16 }}>−{fmtAed(Number(cn.total_aed))}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div style={{ borderTop: '1px solid #eee', paddingTop: 16, fontSize: 11, color: '#888' }}>
          Refund processed by payment provider.
          {cn.provider_refund_ref && <> Reference: {cn.provider_refund_ref}</>}
        </div>
      </div>
    </div>
  )
}
