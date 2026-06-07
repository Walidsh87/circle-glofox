// Empty/whitespace is allowed (it clears the note). Cap length to keep notes terse.
export function validateCoachNote(note: string): string | null {
  if (note.trim().length > 500) return 'Keep the note under 500 characters.'
  return null
}
