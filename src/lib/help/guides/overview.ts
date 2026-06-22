import type { HelpGuide } from '../types'
export const overview: HelpGuide = {
  slug: 'overview', area: 'setup', title: 'Welcome to the Help Center',
  summary: 'Guides for running your gym on the platform — pick a topic from the left.',
  blocks: [
    { type: 'p', text: 'This Help Center explains how to use each part of the platform. Pick a topic on the left, grouped by area.' },
    { type: 'h', text: 'Where to start' },
    { type: 'steps', items: [
      'New here? Start with Getting started.',
      'Setting up billing? See Taking payments & Stripe.',
      'Connecting other tools? See Integrations (Zapier, API, calendar).',
    ] },
    { type: 'note', text: 'These guides are for gym staff. Members have their own simpler views.' },
  ],
}
