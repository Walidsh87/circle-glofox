/**
 * Standardized server-action error.
 *
 * Logs the real (DB / internal) error server-side — so it still reaches the
 * console + Sentry — but returns ONLY a safe, generic message to the client.
 * This prevents Postgres internals (constraint names, column names, row values)
 * from being disclosed to authenticated tenants via `{ error: error.message }`.
 *
 * Usage: replace `if (error) return { error: error.message }` with
 *   if (error) return actionError('actionName', error)
 * or, with a tailored fallback:
 *   if (error) return actionError('actionName', error, 'Could not save your changes.')
 */
export function actionError(
  context: string,
  error: unknown,
  userMessage = 'Something went wrong. Please try again.',
): { error: string } {
  console.error(`[${context}]`, error)
  return { error: userMessage }
}
