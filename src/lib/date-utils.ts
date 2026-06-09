// Add n days to an ISO 'YYYY-MM-DD' date, returning a 'YYYY-MM-DD' UTC date.
export function addDays(iso: string, n: number): string {
  return new Date(Date.parse(iso + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10)
}
