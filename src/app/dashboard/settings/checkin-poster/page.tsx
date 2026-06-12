import QRCode from 'qrcode'
import { notFound } from 'next/navigation'
import { requireOwnerPage } from '@/lib/auth/page-guards'
import { env } from '@/env'

export default async function CheckinPosterPage() {
  const { supabase, profile, box } = await requireOwnerPage()

  const { data: boxRow } = await supabase.from('boxes').select('checkin_token').eq('id', profile.box_id).single()
  if (!boxRow?.checkin_token) notFound()

  const url = `${env.NEXT_PUBLIC_APP_URL}/checkin/${boxRow.checkin_token}`
  const qr = await QRCode.toDataURL(url, { width: 560, margin: 1 })

  return (
    <div style={{ minHeight: '100vh', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-geist-sans)' }}>
      <div style={{ textAlign: 'center', padding: 40 }}>
        <div style={{ fontFamily: 'var(--font-fraunces)', fontSize: 44, fontWeight: 700, letterSpacing: '-0.03em', color: '#111', marginBottom: 6 }}>{box.name}</div>
        <div style={{ fontSize: 19, color: '#555', marginBottom: 28 }}>Scan to check in</div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qr} alt="Check-in QR code" width={420} height={420} style={{ display: 'block', margin: '0 auto' }} />
        <div className="font-mono" style={{ fontSize: 12, color: '#999', marginTop: 26 }}>Open your phone camera and point it here</div>
        <p style={{ fontSize: 12, color: '#bbb', marginTop: 34 }}>Print this page (Ctrl/Cmd+P) and tape it at the door. Regenerating the link in Settings invalidates this poster.</p>
      </div>
    </div>
  )
}
