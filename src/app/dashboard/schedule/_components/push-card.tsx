'use client'

import { useEffect, useState, useTransition } from 'react'
import { savePushSubscription, deletePushSubscription } from '../_actions/push-subscription'

function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

type CardState = 'loading' | 'unsupported' | 'ios-install' | 'denied' | 'ready' | 'subscribed'

export function PushCard({ vapidPublicKey }: { vapidPublicKey: string | null }) {
  const [state, setState] = useState<CardState>('loading')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  useEffect(() => {
    if (!vapidPublicKey) return
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent)
    const standalone = (navigator as { standalone?: boolean }).standalone === true || window.matchMedia('(display-mode: standalone)').matches
    if (isIos && !standalone) { setState('ios-install'); return }
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) { setState('unsupported'); return }
    if (Notification.permission === 'denied') { setState('denied'); return }
    navigator.serviceWorker.register('/sw.js')
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setState(sub ? 'subscribed' : 'ready'))
      .catch(() => setState('unsupported'))
  }, [vapidPublicKey])

  function enable() {
    setError(null)
    start(async () => {
      try {
        const perm = await Notification.requestPermission()
        if (perm !== 'granted') { setState('denied'); return }
        const reg = await navigator.serviceWorker.register('/sw.js')
        const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidPublicKey!) })
        const json = sub.toJSON()
        const res = await savePushSubscription(sub.endpoint, json.keys?.p256dh ?? '', json.keys?.auth ?? '')
        if (res.error) { setError(res.error); await sub.unsubscribe(); return }
        setState('subscribed')
      } catch {
        setError('Could not enable notifications on this device.')
      }
    })
  }

  function disable() {
    setError(null)
    start(async () => {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) { await deletePushSubscription(sub.endpoint); await sub.unsubscribe() }
      setState('ready')
    })
  }

  if (!vapidPublicKey || state === 'loading' || state === 'unsupported') return null
  return (
    <details className="mb-5 rounded-xl border border-line bg-surface px-4 py-3 shadow-card">
      <summary className="cursor-pointer text-[13px] font-semibold text-ink">🔔 Class notifications</summary>
      <div className="mt-2.5">
        {state === 'ios-install' && (
          <p className="text-xs leading-relaxed text-ink-3">
            On iPhone: open this site in Safari, tap <strong>Share → Add to Home Screen</strong>, then open the Circle app icon and enable notifications here.
          </p>
        )}
        {state === 'denied' && <p className="text-xs text-ink-3">Notifications are blocked for this site — allow them in your browser settings, then reload.</p>}
        {(state === 'ready' || state === 'subscribed') && (
          <>
            <p className="mb-2.5 text-xs leading-normal text-ink-3">
              Get a push when a waitlist spot opens and a morning reminder on days you have a class booked.
            </p>
            {state === 'ready' ? (
              <button
                type="button"
                disabled={pending}
                onClick={enable}
                className="h-8 rounded-lg bg-accent px-3.5 text-xs font-bold text-accent-contrast transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
              >
                Enable notifications
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-[12.5px] font-bold text-accent-ink">✓ Enabled on this device</span>
                <button
                  type="button"
                  disabled={pending}
                  onClick={disable}
                  className="h-[30px] rounded-lg border border-line-strong bg-surface px-3 text-xs text-danger transition-colors hover:border-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
                >
                  Disable
                </button>
              </div>
            )}
          </>
        )}
        {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      </div>
    </details>
  )
}
