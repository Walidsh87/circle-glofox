import type { HelpGuide } from '../types'

export const guide: HelpGuide = {
  slug: 'daily-wod-and-planner',
  area: 'classes',
  title: 'Daily WOD, planner & import',
  summary: 'Post the day\'s workout, plan a full month on the calendar, bulk-import a block of WODs, and add scaling options for athletes of different levels.',
  blocks: [
    {
      type: 'p',
      text: 'The WOD Planner is a month-view calendar where each day links to a day editor. You can type a WOD directly, load one from your library, copy it to other dates, or bulk-import an entire month in one paste.',
    },
    {
      type: 'h',
      text: 'Posting today\'s WOD',
    },
    {
      type: 'steps',
      items: [
        'Go to WOD Planner. Today\'s date is highlighted with a coloured border.',
        'Click the day cell to open the day editor.',
        'Fill in the WOD title, choose a scoring type (For Time, AMRAP, Rounds + Reps, or Load), and write the workout description.',
        'Optionally add a strength section: choose a lift, add sets × reps @ percentage, and a description.',
        'Click Save WOD. The planner cell will show the title immediately.',
      ],
    },
    {
      type: 'note',
      text: 'Only one WOD per day per gym is allowed. Saving overwrites the existing WOD for that date. To remove a WOD, open the day and use Clear day (only available when no scores have been logged).',
    },
    {
      type: 'h',
      text: 'Scaling tiers (Rx / Scaled / Beginner)',
    },
    {
      type: 'p',
      text: 'Each WOD can carry up to 6 scaling tiers. A tier has a short label (e.g. "Rx", "Scaled", "Beginner") and a description of the modified movements or loads. Tiers appear on the athlete WOD page, the whiteboard, and the TV board — athletes see the variation that applies to them.',
    },
    {
      type: 'steps',
      items: [
        'In the day editor, scroll to the "Scaling options (optional)" section.',
        'Click "+ Add scaling tier".',
        'Enter a label (e.g. "Rx") and describe the movements or weights for that tier.',
        'Repeat for each additional tier. Use the × button to remove a tier.',
        'Save the WOD — tiers are saved with it.',
      ],
    },
    {
      type: 'h',
      text: 'WOD library and templates',
    },
    {
      type: 'p',
      text: 'Frequently used workouts (benchmarks, hero WODs) can be saved to your WOD Library and loaded onto any date in one click.',
    },
    {
      type: 'steps',
      items: [
        'After saving a WOD, click "Save as template" in the day editor to add it to your library.',
        'To use a saved template: open any day, then click "Load from library" in the top-right and pick a template.',
        'To manage templates (edit, delete), go to WOD Library via the "Library →" button on the planner.',
      ],
    },
    {
      type: 'h',
      text: 'Copy a WOD to other dates',
    },
    {
      type: 'p',
      text: 'If you programme the same workout across multiple days or weeks, use Copy to dates instead of re-entering it.',
    },
    {
      type: 'steps',
      items: [
        'Open the day editor for the WOD you want to copy.',
        'Click "Copy to dates…" below the form.',
        'Pick one or more target dates (click "+ Add date" for more).',
        'Click Copy. The WOD — including strength and scaling tiers — is duplicated to each chosen date.',
      ],
    },
    {
      type: 'h',
      text: 'Batch import (paste a month of WODs)',
    },
    {
      type: 'p',
      text: 'If you write your programming outside the app, use Import to paste an entire block at once. Each day must follow a specific format: a header line with the date and scoring type, then the title, then the workout description, with a blank line between days.',
    },
    {
      type: 'code',
      text: '2026-07-01 For Time\nFran\n21-15-9\nThrusters 42.5kg\nPull-ups\n\n2026-07-02 AMRAP\nCindy\n20 min AMRAP: 5 pull-ups / 10 push-ups / 15 squats',
    },
    {
      type: 'steps',
      items: [
        'Go to Import (button at the top of the WOD Planner).',
        'Paste your formatted text into the text area.',
        'Click Preview. Each day is classified: NEW (will be created), REPLACE (will overwrite an existing unscored WOD), BLOCKED (has scores — won\'t be touched), or INVALID (format error).',
        'Review the preview list. Fix any INVALID rows in the text and re-preview if needed.',
        'Click "Import N days" to commit. Only NEW and REPLACE rows are written.',
      ],
    },
    {
      type: 'note',
      text: 'BLOCKED days are never overwritten — a day with logged scores is protected. INVALID rows are skipped; fix the format and re-import. Scoring keywords accepted on the header line: For Time, AMRAP, Rounds + Reps, Load (defaults to For Time if omitted).',
    },
    {
      type: 'h',
      text: 'AI parse (for freeform programming)',
    },
    {
      type: 'p',
      text: 'If your programming is written in a freeform style (e.g. "Mon: Fran 21-15-9 thrusters/pull-ups"), use ✨ Parse with AI to convert it into the import format automatically.',
    },
    {
      type: 'steps',
      items: [
        'On the Import page, click "✨ Parse with AI".',
        'Paste your freeform programming text into the AI panel.',
        'Click "✨ Parse". The AI converts it into the structured block format and fills the text area.',
        'Review and edit the result, then Preview and Import as normal.',
      ],
    },
    {
      type: 'note',
      text: 'AI parse requires the ANTHROPIC_API_KEY to be set in your Vercel environment. If it is not configured, the panel will show a "not configured" message. The AI never writes to the database directly — you always review and confirm before importing.',
    },
    {
      type: 'link',
      label: 'WOD Planner (month calendar)',
      href: '/dashboard/programming',
    },
    {
      type: 'link',
      label: 'Batch import',
      href: '/dashboard/programming/import',
    },
    {
      type: 'link',
      label: 'WOD Library (templates)',
      href: '/dashboard/programming/library',
    },
  ],
}
