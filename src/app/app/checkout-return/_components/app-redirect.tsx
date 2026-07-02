'use client'

import { useEffect } from 'react'

// appUrl is server-built from resolveAppTarget (custom app schemes only, never http(s)) plus a
// literal status — no attacker-controlled content can reach this navigation.
export function AppRedirect({ appUrl }: { appUrl: string }) {
  useEffect(() => {
    window.location.replace(appUrl)
  }, [appUrl])
  return (
    <a
      href={appUrl}
      className="inline-block rounded-lg bg-ink px-5 py-2.5 text-sm font-semibold text-white"
    >
      Return to the app
    </a>
  )
}
