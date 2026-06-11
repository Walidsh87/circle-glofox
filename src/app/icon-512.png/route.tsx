import { ImageResponse } from 'next/og'

export const dynamic = 'force-static'

export function GET() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#111111' }}>
        <div style={{ width: 320, height: 320, borderRadius: 9999, border: '36px solid #D7FF3E', display: 'flex' }} />
      </div>
    ),
    { width: 512, height: 512 },
  )
}
