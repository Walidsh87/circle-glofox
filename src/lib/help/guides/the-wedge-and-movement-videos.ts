import type { HelpGuide } from '../types'

export const guide: HelpGuide = {
  slug: 'the-wedge-and-movement-videos',
  area: 'classes',
  title: 'The wedge + movement videos',
  summary: 'Automatically show each athlete their exact barbell load in kg on the WOD page and whiteboard, based on their stored 1RM, and attach demo videos to any movement in your library.',
  blocks: [
    {
      type: 'p',
      text: 'The wedge is the platform\'s signature feature: when a WOD includes a strength piece (e.g. "5×3 @ 80% Back Squat"), every booked athlete sees their personal load in kg — calculated from the 1RM they have logged. No spreadsheets, no mental maths on the floor.',
    },
    {
      type: 'h',
      text: 'How the wedge works',
    },
    {
      type: 'bullets',
      items: [
        'Athletes log their 1RM for each lift on the Lifts page (e.g. Back Squat 120 kg). The platform stores it in grams internally and converts to kg at display time.',
        'When a coach posts a WOD with a strength piece — choosing a lift from the dropdown and entering sets as "sets×reps @ %1RM" — the system pairs each booked athlete\'s stored 1RM with the prescribed percentages.',
        'The WOD page ("Your loads" card) shows each athlete their personal kg for every set, rounded to the nearest 2.5 kg bar increment.',
        'The whiteboard shows the same per-athlete kg next to each name so coaches can confirm loads at a glance before the class starts.',
        'If an athlete has not logged their 1RM for the prescribed lift, the WOD page shows the percentage prescription and a prompt to log their 1RM.',
      ],
    },
    {
      type: 'h',
      text: 'Posting a WOD with a strength piece',
    },
    {
      type: 'steps',
      items: [
        'Go to the WOD page and select the date you want to program.',
        'Fill in the "Strength" fields: give the piece a title (e.g. "Back Squat"), choose the lift from the dropdown, and optionally add coaching notes.',
        'Add one or more sets using the strength-sets editor: enter sets, reps, and the percentage of 1RM (e.g. 5 × 3 @ 80%). You can add multiple sets for wave-loading or progression.',
        'Save the WOD. The "Your loads" card will appear for any athlete who has that lift\'s 1RM stored.',
      ],
    },
    {
      type: 'note',
      text: 'The load card only appears when a lift is selected. Metcon-only WODs (no strength piece) do not show the card.',
    },
    {
      type: 'h',
      text: 'Where loads appear',
    },
    {
      type: 'bullets',
      items: [
        'WOD page — the "Your loads" card shows each set with the athlete\'s kg in large text, or the raw percentage with a prompt to log their 1RM if missing.',
        'Whiteboard — the per-athlete roster column shows the heaviest prescribed set\'s load in kg (e.g. "96 kg") or "— log 1RM" if the athlete has no 1RM on file.',
        'Coach prep view — the roster includes the calculated load so coaches can see who is missing a 1RM before the class.',
      ],
    },
    {
      type: 'h',
      text: 'Movement video library',
    },
    {
      type: 'p',
      text: 'The movement library lets coaches attach a YouTube or Vimeo demo video to any movement. Two sections exist: the built-in weightlifting catalog (29 standard lifts) and a "Gym movements" section for custom additions (e.g. Double-unders, GHD sit-ups).',
    },
    {
      type: 'steps',
      items: [
        'Go to Movement library.',
        'Find the movement in the "Weightlifting catalog" section, or scroll to "Gym movements" for custom entries.',
        'Click "Add video" on any row, paste a YouTube or Vimeo link, and click Save.',
        'To add a custom gym movement, use the "Add a gym movement" form at the bottom: enter a name and a video link, then click Add movement.',
        'To replace or remove an existing video, click "Edit" or "Remove" on the movement\'s row.',
      ],
    },
    {
      type: 'note',
      text: 'Only coaches and owners (programming-tier roles) can add, edit, or remove videos. Members see only the movements that have a video attached.',
    },
    {
      type: 'p',
      text: 'When a WOD\'s strength lift has a video in the library, a "▶ demo" link appears next to the strength title on the WOD page. Clicking it jumps directly to that movement\'s row in the library.',
    },
    {
      type: 'link',
      label: 'WOD page',
      href: '/dashboard/wod',
    },
    {
      type: 'link',
      label: 'Movement library',
      href: '/dashboard/movements',
    },
    {
      type: 'link',
      label: 'Lifts (athletes log 1RMs here)',
      href: '/dashboard/lifts',
    },
    {
      type: 'link',
      label: 'Whiteboard',
      href: '/dashboard/whiteboard',
    },
  ],
}
