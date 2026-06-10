export type WaVarValues = Record<string, string>

// Resolves slot values into Twilio contentVariables. {{first_name}} is the only merge token.
export function renderWaVars(varValues: WaVarValues, firstName: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [slot, value] of Object.entries(varValues)) {
    out[slot] = value.split('{{first_name}}').join(firstName)
  }
  return out
}
