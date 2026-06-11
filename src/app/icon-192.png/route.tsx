import { ImageResponse } from 'next/og'

export const dynamic = 'force-static'

export function GET() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#111111' }}>
        <div style={{ width: 120, height: 120, borderRadius: 9999, border: '14px solid #D7FF3E', display: 'flex' }} />
      </div>
    ),
    { width: 192, height: 192 },
  )
}
