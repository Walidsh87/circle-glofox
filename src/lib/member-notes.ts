export const NOTE_TYPES = ['call', 'visit', 'post_class', 'general'] as const
export type NoteType = (typeof NOTE_TYPES)[number]

export const NOTE_TYPE_LABELS: Record<NoteType, string> = {
  call: 'Call',
  visit: 'Visit',
  post_class: 'Post-class',
  general: 'Note',
}

const MAX_NOTE = 2000

/** Staff note validation: non-empty, length-capped, known category. Returns a message or null. */
export function validateNote(note: string, noteType: string): string | null {
  const trimmed = (note ?? '').trim()
  if (!trimmed) return 'Enter a note.'
  if (trimmed.length > MAX_NOTE) return `Note is too long (max ${MAX_NOTE} characters).`
  if (!(NOTE_TYPES as readonly string[]).includes(noteType)) return 'Pick a valid category.'
  return null
}
