export function validateEditTemplateInput(name: string, startTime: string, weekday: number): string | null {
  if (!name?.trim() || !startTime || isNaN(weekday)) return 'Name, weekday, and start time are required.'
  return null
}
