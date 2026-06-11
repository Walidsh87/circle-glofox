const BOM = '\uFEFF'

/** RFC-4180 CSV: quote fields containing comma/quote/newline, double internal quotes.
 *  Leading BOM so Excel opens UTF-8 correctly; CRLF row endings. */
export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined): string => {
    const s = v == null ? '' : String(v)
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return BOM + [headers, ...rows].map((r) => r.map(esc).join(',')).join('\r\n')
}
