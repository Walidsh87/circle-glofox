import { withSentryConfig } from '@sentry/nextjs'

// Content Security Policy.
// - 'unsafe-inline' for styles is required because the app uses inline `style={}` props extensively.
// - Sentry, Stripe, Supabase, and Resend (for tracking pixels in emails — though emails render outside the app) all need to be whitelisted.
// - 'unsafe-eval' kept under script-src only in development to allow Next.js HMR.
const isProd = process.env.NODE_ENV === 'production'
const cspDirectives = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${isProd ? '' : "'unsafe-eval'"} https://js.stripe.com https://*.sentry.io`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co https://*.supabase.in https://api.stripe.com https://*.sentry.io https://*.ingest.sentry.io https://api.resend.com",
  "frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://billing.stripe.com https://checkout.stripe.com",
  "frame-ancestors 'none'",
  "form-action 'self' https://checkout.stripe.com",
  "base-uri 'self'",
  "object-src 'none'",
].join('; ')

const baseHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
]
// Embed pages may be framed by any gym website; everywhere else stays DENY.
const embedCsp = cspDirectives.replace("frame-ancestors 'none'", 'frame-ancestors *')

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: '/((?!embed).*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          ...baseHeaders,
          { key: 'Content-Security-Policy', value: cspDirectives },
        ],
      },
      {
        source: '/embed/:path*',
        headers: [
          ...baseHeaders,
          { key: 'Content-Security-Policy', value: embedCsp },
        ],
      },
    ]
  },
}

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  hideSourceMaps: true,
  disableLogger: true,
})
