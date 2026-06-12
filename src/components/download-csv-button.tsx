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
      className="rounded-lg border border-line bg-surface px-3.5 py-[7px] text-[12.5px] font-semibold text-ink transition-colors hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      {label}
    </button>
  )
}
