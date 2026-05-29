import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { PrintButton } from './_components/print-button'
import { RefundForm } from './_components/refund-form'

function fmtDate(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso))
}

function fmtAed(n: number): string {
  return new Intl.NumberFormat('en-AE', { style: 'currency', currency: 'AED', minimumFractionDigits: 2 }).format(n)
}

export default async function InvoicePage({ params }: { params: { invoiceId: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  const isOwner = profile?.role === 'owner'

  const [{ data: invoice }, { data: creditNotes }] = await Promise.all([
    supabase.from('invoices').select('*').eq('id', params.invoiceId).single(),
    supabase
      .from('credit_notes')
      .select('id, credit_note_number, issued_at, total_aed, reason')
      .eq('invoice_id', params.invoiceId)
      .order('issued_at', { ascending: false }),
  ])

  if (!invoice) notFound()

  const refundedTotal = (creditNotes ?? []).reduce((s, c) => s + Number(c.total_aed), 0)
  const remaining = Math.max(0, Number(invoice.total_aed) - refundedTotal)

  return (
    <div style={{ background: '#f6f6f6', minHeight: '100vh', padding: '40px 20px', fontFamily: 'var(--font-geist-sans), system-ui, sans-serif' }}>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .invoice-sheet { box-shadow: none !important; margin: 0 !important; max-width: none !important; }
        }
      `}</style>

      <div className="no-print" style={{ maxWidth: 800, margin: '0 auto 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <span style={{ fontSize: 13, color: '#666' }}>Invoice {invoice.invoice_number}</span>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
          <PrintButton />
          {isOwner && <RefundForm invoiceId={invoice.id} remainingAed={remaining} />}
        </div>
      </div>

      <div className="invoice-sheet" style={{
        maxWidth: 800, margin: '0 auto', background: 'white',
        padding: '48px 56px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        color: '#111', fontSize: 14, lineHeight: 1.5,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 40 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>TAX INVOICE</h1>
            <div style={{ marginTop: 4, fontSize: 12, color: '#666' }}>VAT Invoice — UAE Federal Decree-Law 8 of 2017</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{invoice.invoice_number}</div>
            <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>Issued {fmtDate(invoice.issued_at)}</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, marginBottom: 36 }}>
          <div>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#888', marginBottom: 6 }}>From</div>
            <div style={{ fontWeight: 600 }}>{invoice.legal_name_snapshot ?? '—'}</div>
            {invoice.billing_address_snapshot && (
              <div style={{ whiteSpace: 'pre-line', color: '#444', marginTop: 2 }}>{invoice.billing_address_snapshot}</div>
            )}
            {invoice.trn_snapshot && (
              <div style={{ marginTop: 6, fontSize: 12 }}><span style={{ color: '#888' }}>TRN:</span> <span style={{ fontFamily: 'var(--font-geist-mono), monospace' }}>{invoice.trn_snapshot}</span></div>
            )}
          </div>
          <div>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#888', marginBottom: 6 }}>Billed to</div>
            <div style={{ fontWeight: 600 }}>{invoice.customer_name_snapshot ?? '—'}</div>
            {invoice.customer_email_snapshot && (
              <div style={{ color: '#444', marginTop: 2 }}>{invoice.customer_email_snapshot}</div>
            )}
          </div>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 24 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #111' }}>
              <th style={{ textAlign: 'left',  padding: '10px 0', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#888', fontWeight: 600 }}>Description</th>
              <th style={{ textAlign: 'right', padding: '10px 0', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#888', fontWeight: 600 }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: '14px 0' }}>{invoice.description ?? 'Membership'}</td>
              <td style={{ padding: '14px 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtAed(Number(invoice.subtotal_aed))}</td>
            </tr>
          </tbody>
        </table>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 40 }}>
          <table style={{ minWidth: 280, fontVariantNumeric: 'tabular-nums' }}>
            <tbody>
              <tr><td style={{ padding: '4px 0', color: '#666' }}>Subtotal</td><td style={{ padding: '4px 0 4px 32px', textAlign: 'right' }}>{fmtAed(Number(invoice.subtotal_aed))}</td></tr>
              <tr><td style={{ padding: '4px 0', color: '#666' }}>VAT ({Number(invoice.vat_rate).toFixed(0)}%)</td><td style={{ padding: '4px 0 4px 32px', textAlign: 'right' }}>{fmtAed(Number(invoice.vat_aed))}</td></tr>
              <tr style={{ borderTop: '2px solid #111' }}>
                <td style={{ padding: '10px 0 0', fontWeight: 700 }}>Total</td>
                <td style={{ padding: '10px 0 0 32px', textAlign: 'right', fontWeight: 700, fontSize: 16 }}>{fmtAed(Number(invoice.total_aed))}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div style={{ borderTop: '1px solid #eee', paddingTop: 16, fontSize: 11, color: '#888' }}>
          Paid online. This is a system-generated tax invoice.
          {invoice.provider_payment_ref && <> Reference: {invoice.provider_payment_ref}</>}
        </div>
      </div>

      {(creditNotes ?? []).length > 0 && (
        <div className="no-print invoice-sheet" style={{
          maxWidth: 800, margin: '16px auto 0', background: 'white',
          padding: '20px 28px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          color: '#111', fontSize: 13,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Credit notes against this invoice</div>
          {(creditNotes ?? []).map((cn) => (
            <div key={cn.id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '8px 0', borderTop: '1px solid #eee',
            }}>
              <div>
                <Link href={`/dashboard/credit-notes/${cn.id}`} style={{ color: '#111', fontFamily: 'var(--font-geist-mono), monospace', textDecoration: 'none', fontSize: 12.5 }}>
                  {cn.credit_note_number}
                </Link>
                {cn.reason && <span style={{ color: '#888', marginLeft: 10, fontSize: 12 }}>· {cn.reason}</span>}
              </div>
              <div style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                −AED {Number(cn.total_aed).toFixed(2)}
              </div>
            </div>
          ))}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            paddingTop: 10, marginTop: 6, borderTop: '2px solid #111', fontSize: 13,
          }}>
            <span style={{ color: '#666' }}>Net after refunds</span>
            <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
              AED {(Number(invoice.total_aed) - refundedTotal).toFixed(2)}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
