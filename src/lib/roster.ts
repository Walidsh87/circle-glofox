// First names for the schedule "Who's coming" roster (#80).
export function rosterFirstNames(fullNames: (string | null)[]): string[] {
  return fullNames.map((n) => n?.trim().split(/\s+/)[0] || 'Member')
}
