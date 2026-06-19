// Shared HTML-entity escaping. Two variants, both escaping `&` first so the
// entities they emit are never re-escaped:
//  - escapeHtml         — also escapes `"` → `&quot;`; use when the value may
//                         land inside a double-quoted attribute.
//  - escapeHtmlNoQuote  — element-content only (leaves `"` as-is).

/** Escape `& < > "` for safe interpolation into content OR a double-quoted attribute. */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Escape `& < >` for safe interpolation into element content (does not escape quotes). */
export function escapeHtmlNoQuote(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
