'use client'

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      style={{
        height: 36, padding: '0 18px',
        background: 'var(--circle-lime, #d6f24a)', color: 'var(--circle-ink, #111)',
        border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
      }}
    >
      Save as PDF
    </button>
  )
}
