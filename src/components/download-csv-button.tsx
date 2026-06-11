'use client'

import { toCsv } from '@/lib/csv'

export function DownloadCsvButton({ filename, headers, rows, label = 'Export CSV' }: {
  filename: string
  headers: string[]
  rows: (string | number | null | undefined)[][]
  label?: string
}) {
  function onDownload() {
    const blob = new Blob([toCsv(headers, rows)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <button
      onClick={onDownload}
      style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--c-border)', background: 'var(--c-surface)', color: 'var(--c-ink)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}
    >
      {label}
    </button>
  )
}
