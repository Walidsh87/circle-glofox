type ParsePrompt = { system: string; user: string }

// Builds the Claude prompt that converts freeform programming into the strict
// block format `parseBatch` understands. Pure: `today` is injected (defaults to
// the real date) so the model can resolve relative days, and so it's testable.
export function buildParsePrompt(freeform: string, today: string = new Date().toISOString().slice(0, 10)): ParsePrompt {
  const system = `You convert a coach's freeform CrossFit programming into a strict block format for an importer.

Today's date is ${today}. Resolve relative days (e.g. "Monday", "tomorrow") against the current week starting from today.

OUTPUT CONTRACT — output ONLY day blocks, nothing else:
- One block per training day. Separate blocks with a single blank line.
- Line 1: an ISO date in YYYY-MM-DD format, then an optional scoring word — one of: For Time, AMRAP, Rounds + Reps, Load. Default to "For Time" if the scoring is unclear.
- Line 2: a short WOD title.
- Lines 3 and beyond: the workout (movements, reps, loads), one idea per line.
- Do NOT wrap the output in code fences. Do NOT add any commentary, explanations, or headings.

EXAMPLE
Input: "Mon Fran 21-15-9 thrusters/pullups. Tue 20min amrap cindy 5 pullups 10 pushups 15 squats"
Output:
2026-07-01 For Time
Fran
21-15-9
Thrusters
Pull-ups

2026-07-02 AMRAP
Cindy
20 min AMRAP:
5 pull-ups
10 push-ups
15 squats`
  return { system, user: freeform }
}

// Cleans the model output: strips a surrounding markdown code fence and trims.
// (Stray non-block prose, if any, is caught downstream as an INVALID row.)
export function extractBlockText(raw: string): string {
  const s = (raw ?? '').trim()
  const fence = s.match(/^```[a-z]*\n([\s\S]*?)\n```$/i)
  return (fence ? fence[1] : s).trim()
}
